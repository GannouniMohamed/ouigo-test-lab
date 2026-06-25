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
	/** Number of actions captured in the recorded spec, independent of any run. */
	recordedStepCount?: number;
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
	// Per-mode scope of the underlying recorded step. A "skipped" step that is
	// inactive in the run's mode is "ignored for this mode" rather than
	// "not reached".
	scope?: StepScope;
}

// Run modes a scenario can execute in.
export type RunMode = "visible" | "invisible";

// Per-mode scope of a recorded step:
//  - both: runs in both modes (default)
//  - visible: runs only in visible (headed) mode — ignored in invisible
//  - invisible: runs only in invisible (headless) mode — ignored in visible
//  - skip: never runs (ignored in both)
export type StepScope = "both" | "visible" | "invisible" | "skip";

// A step parsed from the recorded spec (independent of any run). Used for the
// recorded step count and for step management (scope/delete/edit).
export interface RecordedStep {
	index: number;
	title: string;
	scope?: StepScope;
}

// A step-management edit applied (client-side) to a draft spec.
export type StepEditOp =
	| { op: "delete"; index: number }
	| { op: "scope"; index: number; scope: StepScope }
	| { op: "edit"; index: number; code: string };

// Whether a step actually executes in the given mode.
export function stepActiveInMode(
	scope: StepScope | undefined,
	mode: RunMode,
): boolean {
	const s = scope ?? "both";
	return s === "both" || s === mode;
}

export interface Report {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	// projectId/tunnelId locate the scenario for step management from the report.
	projectId?: string;
	tunnelId?: string;
	// environmentId + mode let the report re-run the scenario in place.
	environmentId?: string;
	mode?: RunMode;
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
	| { type: "step-skipped"; index: number; title: string }
	| { type: "log"; line: string }
	| { type: "run-finished"; status: RunStatus; durationMs: number };

export interface RunResult {
	runId: string;
	status: RunStatus;
	durationMs: number;
	report: Report;
}

// Per-run options chosen at launch time (run-options dialog). All optional so
// existing callers (and the auto-run) get sensible defaults.
export interface RunOptions {
	// Visible (headed) browser by default — matches how scenarios are recorded,
	// so consent banners (e.g. Didomi) that don't render headless still appear.
	headed?: boolean;
	// Run this draft spec instead of the scenario's stored spec (step-management
	// "Relancer" without persisting). The runner compiles it for the mode.
	specDraft?: string;
}
