import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { LastRun, Scenario } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function scenariosDir(): string {
	return join(getWorkspaceDir(), "scenarios");
}

function scenarioDir(id: string): string {
	return join(scenariosDir(), id);
}

function metaPath(id: string): string {
	return join(scenarioDir(id), "scenario.meta.json");
}

function ensureScenariosDir(): void {
	mkdirSync(scenariosDir(), { recursive: true });
}

export function listScenarios(): Scenario[] {
	ensureScenariosDir();
	const base = scenariosDir();
	const results: Scenario[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "scenario.meta.json");
		if (!existsSync(meta)) continue;
		results.push(JSON.parse(readFileSync(meta, "utf-8")) as Scenario);
	}
	return results;
}

export function getScenario(id: string): Scenario {
	const meta = metaPath(id);
	if (!existsSync(meta)) {
		throw new Error(`Scenario not found: ${id}`);
	}
	return JSON.parse(readFileSync(meta, "utf-8")) as Scenario;
}

export function saveScenario(s: Scenario, specContent: string): void {
	const dir = scenarioDir(s.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(metaPath(s.id), JSON.stringify(s, null, 2), "utf-8");
	writeFileSync(join(dir, s.specFile), specContent, "utf-8");
}

export function deleteScenario(id: string): void {
	const dir = scenarioDir(id);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function updateLastRun(id: string, lastRun: LastRun): void {
	const scenario = getScenario(id);
	scenario.lastRun = lastRun;
	writeFileSync(metaPath(id), JSON.stringify(scenario, null, 2), "utf-8");
}
