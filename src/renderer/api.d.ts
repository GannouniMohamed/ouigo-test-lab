import type {
	BatchEvent,
	BatchOptions,
	BatchReport,
	Environment,
	Platform,
	Project,
	RecordedStep,
	Report,
	ReportSummary,
	RunEvent,
	Scenario,
	Tunnel,
} from "../shared/types";

interface OtlApi {
	platform: NodeJS.Platform;
	windowControls: {
		minimize(): void;
		maximize(): void;
		close(): void;
	};
	browsersReady(): Promise<boolean>;
	installBrowsers(): Promise<boolean>;

	listProjects(): Promise<Project[]>;
	getProject(id: string): Promise<Project>;
	createProject(input: {
		name: string;
		description: string;
		environments?: Array<{ label: string; baseURL: string }>;
	}): Promise<Project>;
	updateProject(p: Project): Promise<void>;
	deleteProject(id: string): Promise<void>;

	listEnvironments(projectId: string): Promise<Environment[]>;
	saveEnvironment(projectId: string, env: Environment): Promise<void>;
	deleteEnvironment(projectId: string, envId: string): Promise<void>;

	listTunnels(projectId: string): Promise<Tunnel[]>;
	createTunnel(input: {
		projectId: string;
		name: string;
		color?: string;
		description?: string;
	}): Promise<Tunnel>;
	updateTunnel(t: Tunnel): Promise<Tunnel>;
	deleteTunnel(projectId: string, tunnelId: string): Promise<void>;

	listScenariosByProject(projectId: string): Promise<Scenario[]>;
	deleteScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
	): Promise<void>;
	runScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
		opts?: { headed?: boolean; specDraft?: string },
	): Promise<{ runId: string; steps?: string[] }>;
	getScenarioSpec(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
	): Promise<string>;
	saveScenarioSpec(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		spec: string,
	): Promise<RecordedStep[]>;
	runBatch(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
		options: BatchOptions,
	): Promise<{ batchId: string }>;
	getBatch(batchId: string): Promise<BatchReport>;
	cancelRun(runId: string): Promise<void>;
	onRunEvent(runId: string, cb: (e: RunEvent) => void): () => void;
	onBatchEvent(batchId: string, cb: (e: BatchEvent) => void): () => void;

	listReports(scenarioId?: string): Promise<ReportSummary[]>;
	getReport(runId: string): Promise<Report>;

	startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
		platform?: Platform;
	}): Promise<{ recordingId: string }>;
	stopRecording(recordingId: string): Promise<Scenario>;
}

declare global {
	interface Window {
		api: OtlApi;
	}
}
