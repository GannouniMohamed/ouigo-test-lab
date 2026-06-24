export type Platform = "web" | "responsive" | "mobile";
export type RunStatus = "passed" | "failed" | "cancelled";
export type StepStatus = "passed" | "failed" | "skipped";
export type LastRunStatus = "passed" | "failed" | "never";

export interface LastRun {
	status: LastRunStatus;
	at?: string;
	durationMs?: number;
	stepCount?: number;
}

export interface Scenario {
	id: string;
	projectId: string;
	tunnelId: string;
	name: string;
	platform: Platform;
	browser: "chromium" | "firefox" | "webkit";
	defaultEnvironmentId: string;
	tags: string[];
	specFile: string;
	createdAt: string;
	lastRun: LastRun;
}

export interface Environment {
	id: string;
	label: string;
	baseURL: string;
	variables: Record<string, string>;
}

export interface Project {
	id: string;
	name: string;
	description: string;
	environments: Environment[];
	createdAt: string;
}

export interface Tunnel {
	id: string;
	projectId: string;
	name: string;
	order: number;
	color: string;
	description: string;
	createdAt: string;
}

export interface ReportStep {
	index: number;
	title: string;
	status: StepStatus;
	durationMs: number;
	error?: string;
	screenshotPath?: string;
}

export interface Report {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	environmentLabel: string;
	status: RunStatus;
	durationMs: number;
	startedAt: string;
	steps: ReportStep[];
}

export interface ReportSummary {
	runId: string;
	scenarioId: string;
	status: RunStatus;
	startedAt: string;
	durationMs: number;
}

export type RunEvent =
	| { type: "run-started"; runId: string; totalSteps?: number }
	| { type: "step-started"; index: number; title: string }
	| { type: "step-passed"; index: number; durationMs: number }
	| { type: "step-failed"; index: number; error: string; screenshot?: string }
	| { type: "log"; line: string }
	| { type: "run-finished"; status: RunStatus; durationMs: number };

export interface RunResult {
	runId: string;
	status: RunStatus;
	durationMs: number;
	report: Report;
}
