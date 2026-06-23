import type {
	Environment,
	Report,
	ReportSummary,
	RunEvent,
	Scenario,
} from "../shared/types";

interface OtlApi {
	listScenarios(): Promise<Scenario[]>;
	getScenario(id: string): Promise<Scenario>;
	deleteScenario(id: string): Promise<void>;
	listEnvironments(): Promise<Environment[]>;
	saveEnvironment(env: Environment): Promise<void>;
	runScenario(scenarioId: string, envId: string): Promise<{ runId: string }>;
	cancelRun(runId: string): Promise<void>;
	onRunEvent(runId: string, cb: (e: RunEvent) => void): () => void;
	listReports(scenarioId?: string): Promise<ReportSummary[]>;
	getReport(runId: string): Promise<Report>;
}

declare global {
	interface Window {
		api: OtlApi;
	}
}
