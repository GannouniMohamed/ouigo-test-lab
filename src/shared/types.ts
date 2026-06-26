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

// Source du build mobile (Maestro) attaché à un environnement.
//  - "installed" : l'app est supposée déjà présente sur l'appareil (appId seul)
//  - "firebase"  : on récupère le dernier APK via Firebase App Distribution
export type MobileAppSource = "installed" | "firebase";

export interface FirebaseAppDistConfig {
	projectNumber: string; // numéro de projet Firebase (numérique)
	firebaseAppId: string; // 1:1234567890:android:abc123
	serviceAccountKeyPath: string; // chemin du JSON de compte de service
}

export interface MobileApp {
	appId: string; // package name Android (com.ouigo.app) — install/launch Maestro
	source: MobileAppSource;
	firebase?: FirebaseAppDistConfig; // présent ssi source === "firebase"
}

export interface Environment {
	id: string;
	label: string;
	baseURL: string;
	variables: Record<string, string>;
	// Mobile (Maestro) : config de l'app sous test. Optionnel — ignoré par les
	// scénarios web/responsive.
	app?: MobileApp;
}

// Appareil/émulateur mobile cible (Android en v1).
export interface MobileDevice {
	id: string; // "emulator-5554" ou UDID
	name: string; // "Pixel 6 — API 33"
	kind: "emulator" | "physical";
	state: "booted" | "offline";
}

// Un point de contrôle du diagnostic prérequis mobile (affiché en Phase 6).
export interface DoctorCheck {
	ok: boolean;
	label: string; // ex. "Java 17+"
	version?: string; // version détectée si dispo
	hint?: string; // conseil d'installation si !ok (français)
}

// Rapport complet du doctor mobile.
export interface MobileDoctorReport {
	allOk: boolean;
	java: DoctorCheck;
	maestro: DoctorCheck;
	adb: DoctorCheck;
	studio: DoctorCheck;
	device: DoctorCheck; // au moins un appareil/émulateur joignable
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
	// Set when this run is one iteration of a batch (Feature 2). Lets the history
	// group every run of the same lot together. Undefined for simple runs.
	batchId?: string;
}

export interface ReportSummary {
	runId: string;
	scenarioId: string;
	status: RunStatus;
	startedAt: string;
	durationMs: number;
	// Mirrors Report.batchId so the history can group runs by lot without
	// loading every full report.
	batchId?: string;
	// Mirror Report.projectId/environmentId so the history can filter by the
	// active project (and env) without loading every full report.
	projectId?: string;
	environmentId?: string;
}

export type RunEvent =
	| {
			type: "run-started";
			runId: string;
			totalSteps?: number;
			steps?: string[];
	  }
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
	// Set when this run is one iteration of a batch — stamped onto the persisted
	// Report so the history can group the lot. Undefined for simple runs.
	batchId?: string;
	// Mobile : appareil/émulateur cible choisi au lancement.
	deviceId?: string;
}

// ── Batch runs (Feature 2: lancer N fois pour valider KPI / trackings) ───────

// How the N iterations are scheduled. Sequential is the default — gentlest on
// weak machines and the only mode that keeps tracking/KPI attribution clean
// (parallel browser sessions race and pollute analytics). Parallel is capped
// at two concurrent runs.
export type BatchExecutionMode = "sequential" | "parallel";

export type BatchItemStatus =
	| "pending"
	| "running"
	| "passed"
	| "failed"
	| "cancelled";

// One iteration within a batch. Each references its saved Report by runId, so
// the summary can drill down into any single run's full step list.
export interface BatchItem {
	index: number; // 1-based position in the batch
	runId?: string; // set once the iteration starts
	status: BatchItemStatus;
	durationMs?: number;
}

export interface BatchReport {
	batchId: string;
	scenarioId: string;
	scenarioName: string;
	projectId?: string;
	tunnelId?: string;
	environmentId?: string;
	environmentLabel: string;
	mode: RunMode;
	execution: BatchExecutionMode;
	total: number;
	startedAt: string;
	finishedAt?: string;
	items: BatchItem[];
}

// Options chosen at launch for a multi-run batch.
export interface BatchOptions {
	headed?: boolean;
	execution: BatchExecutionMode;
	total: number;
}

export type BatchEvent =
	| { type: "batch-started"; batchId: string; total: number }
	| { type: "item-started"; index: number; runId: string }
	| {
			type: "item-finished";
			index: number;
			runId: string;
			status: RunStatus;
			durationMs: number;
	  }
	| { type: "batch-finished"; batchId: string };

export interface BatchStats {
	total: number;
	done: number;
	passed: number;
	failed: number;
	minMs?: number;
	avgMs?: number;
	maxMs?: number;
}

// Aggregate a batch's items into headline KPIs (X/N réussis, durées min/moy/max).
export function summarizeBatch(items: BatchItem[]): BatchStats {
	const finished = items.filter(
		(i) => i.status === "passed" || i.status === "failed",
	);
	const durations = finished
		.map((i) => i.durationMs)
		.filter((d): d is number => typeof d === "number");
	const stats: BatchStats = {
		total: items.length,
		done: finished.length,
		passed: items.filter((i) => i.status === "passed").length,
		failed: items.filter((i) => i.status === "failed").length,
	};
	if (durations.length > 0) {
		stats.minMs = Math.min(...durations);
		stats.maxMs = Math.max(...durations);
		stats.avgMs = Math.round(
			durations.reduce((a, b) => a + b, 0) / durations.length,
		);
	}
	return stats;
}
