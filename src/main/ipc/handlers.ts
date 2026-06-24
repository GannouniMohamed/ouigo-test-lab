import type {
	Environment,
	Project,
	Report,
	ReportSummary,
	Scenario,
	Tunnel,
} from "../../shared/types";
import { slugify } from "../recorder/slugify";
import { isBrowserInstalled } from "../runner/ensureBrowsers";
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
	listScenariosByProject,
} from "../stores/scenarioStore";
import {
	deleteTunnel,
	getTunnel,
	listTunnels,
	saveTunnel,
} from "../stores/tunnelStore";

function uniqueProjectId(base: string): string {
	const existing = new Set(listProjects().map((p) => p.id));
	let candidate = base || "projet";
	let n = 2;
	while (existing.has(candidate)) candidate = `${base}-${n++}`;
	return candidate;
}

function uniqueTunnelId(projectId: string, base: string): string {
	const existing = new Set(listTunnels(projectId).map((t) => t.id));
	let candidate = base || "tunnel";
	let n = 2;
	while (existing.has(candidate)) candidate = `${base}-${n++}`;
	return candidate;
}

export function handleListProjects(): Project[] {
	return listProjects();
}

export function handleGetProject(id: string): Project {
	return getProject(id);
}

export function handleCreateProject(input: {
	name: string;
	description: string;
}): Project {
	const id = uniqueProjectId(slugify(input.name));
	const now = new Date().toISOString();
	const project: Project = {
		id,
		name: input.name,
		description: input.description,
		environments: defaultEnvironments(),
		createdAt: now,
	};
	saveProject(project);
	saveTunnel({
		id: "general",
		projectId: id,
		name: "Général",
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
}): Tunnel {
	const id = uniqueTunnelId(input.projectId, slugify(input.name));
	const order = listTunnels(input.projectId).length;
	const tunnel: Tunnel = {
		id,
		projectId: input.projectId,
		name: input.name,
		order,
		createdAt: new Date().toISOString(),
	};
	saveTunnel(tunnel);
	return tunnel;
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

export function handleListReports(scenarioId?: string): ReportSummary[] {
	return listReports(scenarioId);
}

export function handleGetReport(runId: string): Report {
	return getReport(runId);
}

export function handleBrowsersReady(): boolean {
	return isBrowserInstalled("chromium");
}

export { getEnvironment, getTunnel };
