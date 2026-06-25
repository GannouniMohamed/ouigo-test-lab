import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import { parseRecordedSteps } from "../../shared/spec";
import type {
	Environment,
	Project,
	RecordedStep,
	Report,
	ReportSummary,
	RunEvent,
	RunOptions,
	Scenario,
	Tunnel,
} from "../../shared/types";
import { slugify } from "../recorder/slugify";
import { isBrowserInstalled } from "../runner/ensureBrowsers";
import { playwrightRunner } from "../runner/playwrightRunner";
import {
	defaultEnvironments,
	deleteEnvironment,
	deleteProject,
	getEnvironment,
	getProject,
	listEnvironments,
	listProjects,
	saveEnvironment,
	saveProject,
} from "../stores/projectStore";
import { getReport, listReports } from "../stores/reportStore";
import {
	deleteScenario,
	getScenario,
	listScenariosByProject,
	readScenarioSpec,
	saveScenario,
} from "../stores/scenarioStore";
import {
	deleteTunnel,
	getTunnel,
	listTunnels,
	saveTunnel,
} from "../stores/tunnelStore";

function uniqueProjectId(base: string): string {
	const existing = new Set(listProjects().map((p) => p.id));
	const safeBase = base || "projet";
	let candidate = safeBase;
	let n = 2;
	while (existing.has(candidate)) candidate = `${safeBase}-${n++}`;
	return candidate;
}

function uniqueTunnelId(projectId: string, base: string): string {
	const existing = new Set(listTunnels(projectId).map((t) => t.id));
	const safeBase = base || "tunnel";
	let candidate = safeBase;
	let n = 2;
	while (existing.has(candidate)) candidate = `${safeBase}-${n++}`;
	return candidate;
}

export function handleListProjects(): Project[] {
	return listProjects();
}

export function handleGetProject(id: string): Project {
	return getProject(id);
}

function buildEnvironments(
	rows: Array<{ label: string; baseURL: string }>,
): Environment[] {
	const used = new Set<string>();
	return rows.map((row) => {
		const base = slugify(row.label);
		let id = base;
		let n = 2;
		while (used.has(id)) id = `${base}-${n++}`;
		used.add(id);
		return { id, label: row.label, baseURL: row.baseURL, variables: {} };
	});
}

export function handleCreateProject(input: {
	name: string;
	description: string;
	environments?: Array<{ label: string; baseURL: string }>;
}): Project {
	const id = uniqueProjectId(slugify(input.name));
	const now = new Date().toISOString();
	const environments =
		input.environments && input.environments.length > 0
			? buildEnvironments(input.environments)
			: defaultEnvironments();
	const project: Project = {
		id,
		name: input.name,
		description: input.description,
		environments,
		createdAt: now,
	};
	saveProject(project);
	saveTunnel({
		id: "general",
		projectId: id,
		name: "Général",
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
		order: 0,
		createdAt: now,
	});
	return project;
}

export function handleUpdateProject(p: Project): void {
	saveProject(p);
}

export function handleDeleteProject(id: string): void {
	deleteProject(id);
}

export function handleListEnvironments(projectId: string): Environment[] {
	return listEnvironments(projectId);
}

export function handleSaveEnvironment(
	projectId: string,
	env: Environment,
): void {
	saveEnvironment(projectId, env);
}

export function handleDeleteEnvironment(
	projectId: string,
	envId: string,
): void {
	deleteEnvironment(projectId, envId);
}

export function handleListTunnels(projectId: string): Tunnel[] {
	return listTunnels(projectId);
}

export function handleCreateTunnel(input: {
	projectId: string;
	name: string;
	color?: string;
	description?: string;
}): Tunnel {
	const id = uniqueTunnelId(input.projectId, slugify(input.name));
	const order = listTunnels(input.projectId).length;
	const tunnel: Tunnel = {
		id,
		projectId: input.projectId,
		name: input.name,
		order,
		color: input.color ?? DEFAULT_TUNNEL_COLOR,
		description: input.description ?? "",
		createdAt: new Date().toISOString(),
	};
	saveTunnel(tunnel);
	return tunnel;
}

export function handleUpdateTunnel(input: Tunnel): Tunnel {
	const existing = getTunnel(input.projectId, input.id); // throws if missing
	const updated: Tunnel = {
		...existing,
		name: input.name,
		color: input.color,
		description: input.description,
	};
	saveTunnel(updated);
	return updated;
}

export function handleDeleteTunnel(projectId: string, tunnelId: string): void {
	deleteTunnel(projectId, tunnelId);
}

export function handleListScenariosByProject(projectId: string): Scenario[] {
	return listScenariosByProject(projectId);
}

export function handleDeleteScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): void {
	deleteScenario(projectId, tunnelId, id);
}

export function handleGetScenarioSpec(
	projectId: string,
	tunnelId: string,
	scenarioId: string,
): string {
	return readScenarioSpec(projectId, tunnelId, scenarioId);
}

// Persist a draft spec (step-management commit). Recomputes the recorded step
// count and returns the parsed steps for the UI.
export function handleSaveScenarioSpec(
	projectId: string,
	tunnelId: string,
	scenarioId: string,
	spec: string,
): RecordedStep[] {
	const scenario = getScenario(projectId, tunnelId, scenarioId);
	const steps = parseRecordedSteps(spec);
	scenario.recordedStepCount = steps.length;
	saveScenario(scenario, spec);
	return steps;
}

export function handleListReports(scenarioId?: string): ReportSummary[] {
	return listReports(scenarioId);
}

export function handleGetReport(runId: string): Report {
	return getReport(runId);
}

export function handleBrowsersReady(): boolean {
	return isBrowserInstalled("chromium");
}

export async function handleRunScenario(
	projectId: string,
	tunnelId: string,
	scenarioId: string,
	envId: string,
	sendEvent: (channel: string, payload: RunEvent) => void,
	opts?: RunOptions,
): Promise<{ runId: string }> {
	const scenario = getScenario(projectId, tunnelId, scenarioId);
	const env = getEnvironment(projectId, envId);
	let runId = "";
	const ready = new Promise<string>((resolve) => {
		void playwrightRunner.run(
			scenario,
			env,
			(ev) => {
				if (ev.type === "run-started") {
					runId = ev.runId;
					resolve(runId);
				}
				if (runId) sendEvent(`run-event:${runId}`, ev);
			},
			opts,
		);
	});
	return { runId: await ready };
}

export { getEnvironment };
