import type {
	Environment,
	Report,
	ReportSummary,
	Scenario,
} from "../../shared/types";
import { isBrowserInstalled } from "../runner/ensureBrowsers";
import {
	getEnvironment,
	listEnvironments,
	saveEnvironment,
} from "../stores/environmentStore";
import { getReport, listReports } from "../stores/reportStore";
import {
	deleteScenario,
	getScenario,
	listScenarios,
} from "../stores/scenarioStore";

export function handleListScenarios(): Scenario[] {
	return listScenarios();
}

export function handleGetScenario(id: string): Scenario {
	return getScenario(id);
}

export function handleDeleteScenario(id: string): void {
	deleteScenario(id);
}

export function handleListEnvironments(): Environment[] {
	return listEnvironments();
}

export function handleSaveEnvironment(env: Environment): void {
	saveEnvironment(env);
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

// Re-export getEnvironment for use in register.ts
export { getEnvironment };
