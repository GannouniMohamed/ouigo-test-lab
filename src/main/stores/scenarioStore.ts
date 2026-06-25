import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseRecordedSteps } from "../../shared/spec";
import type { LastRun, Scenario } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

// Backfill recordedStepCount for scenarios recorded before the field existed,
// by parsing their spec on read. Keeps older scenarios from showing "0 étapes".
function hydrateRecordedStepCount(s: Scenario, dir: string): Scenario {
	if (typeof s.recordedStepCount === "number") return s;
	const specPath = join(dir, s.specFile);
	if (!existsSync(specPath)) return s;
	try {
		s.recordedStepCount = parseRecordedSteps(
			readFileSync(specPath, "utf-8"),
		).length;
	} catch {
		/* leave undefined — UI falls back gracefully */
	}
	return s;
}

function tunnelScenariosDir(projectId: string, tunnelId: string): string {
	return join(
		getWorkspaceDir(),
		"projects",
		projectId,
		"tunnels",
		tunnelId,
		"scenarios",
	);
}

function scenarioDir(projectId: string, tunnelId: string, id: string): string {
	return join(tunnelScenariosDir(projectId, tunnelId), id);
}

function metaPath(projectId: string, tunnelId: string, id: string): string {
	return join(scenarioDir(projectId, tunnelId, id), "scenario.meta.json");
}

function tunnelsDir(projectId: string): string {
	return join(getWorkspaceDir(), "projects", projectId, "tunnels");
}

export function listScenarios(projectId: string, tunnelId: string): Scenario[] {
	const base = tunnelScenariosDir(projectId, tunnelId);
	mkdirSync(base, { recursive: true });
	const results: Scenario[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "scenario.meta.json");
		if (!existsSync(meta)) continue;
		const scenario = JSON.parse(readFileSync(meta, "utf-8")) as Scenario;
		results.push(hydrateRecordedStepCount(scenario, join(base, entry.name)));
	}
	return results;
}

export function listScenariosByProject(projectId: string): Scenario[] {
	const base = tunnelsDir(projectId);
	if (!existsSync(base)) return [];
	const results: Scenario[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		results.push(...listScenarios(projectId, entry.name));
	}
	return results;
}

export function getScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): Scenario {
	const meta = metaPath(projectId, tunnelId, id);
	if (!existsSync(meta)) throw new Error(`Scenario not found: ${id}`);
	const scenario = JSON.parse(readFileSync(meta, "utf-8")) as Scenario;
	return hydrateRecordedStepCount(
		scenario,
		scenarioDir(projectId, tunnelId, id),
	);
}

export function readScenarioSpec(
	projectId: string,
	tunnelId: string,
	id: string,
): string {
	const scenario = getScenario(projectId, tunnelId, id);
	const specPath = join(
		scenarioDir(projectId, tunnelId, id),
		scenario.specFile,
	);
	return readFileSync(specPath, "utf-8");
}

export function saveScenario(s: Scenario, specContent: string): void {
	const dir = scenarioDir(s.projectId, s.tunnelId, s.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		metaPath(s.projectId, s.tunnelId, s.id),
		JSON.stringify(s, null, 2),
		"utf-8",
	);
	writeFileSync(join(dir, s.specFile), specContent, "utf-8");
}

export function deleteScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): void {
	const dir = scenarioDir(projectId, tunnelId, id);
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function updateLastRun(
	projectId: string,
	tunnelId: string,
	id: string,
	lastRun: LastRun,
): void {
	const scenario = getScenario(projectId, tunnelId, id);
	scenario.lastRun = lastRun;
	writeFileSync(
		metaPath(projectId, tunnelId, id),
		JSON.stringify(scenario, null, 2),
		"utf-8",
	);
}
