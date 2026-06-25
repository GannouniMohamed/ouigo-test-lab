import type {
	Report,
	ReportStep,
	RunMode,
	RunStatus,
	StepStatus,
} from "../../shared/types";

export interface ReportContext {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	projectId?: string;
	tunnelId?: string;
	environmentId?: string;
	mode?: RunMode;
	environmentLabel: string;
	startedAt?: string;
}

// ---------------------------------------------------------------------------
// Local shape interfaces for defensive parsing of the Playwright JSON report
// ---------------------------------------------------------------------------

interface PwAttachment {
	name: string;
	path?: string;
	contentType?: string;
}

interface PwStep {
	title: string;
	duration: number;
	error?: { message?: string };
}

interface PwResult {
	status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
	duration: number;
	error?: { message?: string };
	steps?: PwStep[];
	attachments?: PwAttachment[];
}

interface PwTest {
	results: PwResult[];
}

interface PwSpec {
	title: string;
	ok: boolean;
	tests: PwTest[];
}

interface PwSuite {
	title: string;
	file?: string;
	specs: PwSpec[];
	suites?: PwSuite[];
}

interface PwReport {
	suites: PwSuite[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectSpecs(suite: PwSuite): PwSpec[] {
	const specs: PwSpec[] = [...(suite.specs ?? [])];
	for (const nested of suite.suites ?? []) {
		specs.push(...collectSpecs(nested));
	}
	return specs;
}

function getLastResult(spec: PwSpec): PwResult | undefined {
	const test = spec.tests?.[0];
	if (!test || !test.results || test.results.length === 0) return undefined;
	return test.results[test.results.length - 1];
}

function isPwReport(raw: unknown): raw is PwReport {
	return (
		typeof raw === "object" &&
		raw !== null &&
		"suites" in raw &&
		Array.isArray((raw as Record<string, unknown>).suites)
	);
}

const FAILING_STATUSES = new Set(["failed", "timedOut", "interrupted"]);

// Pull the failure screenshot straight from the result-level attachments.
// Playwright attaches the "only-on-failure" screenshot to the RESULT, not to a
// step. mapPlaywrightReport only surfaces it when the JSON report has steps to
// hang it on — but flat recorded specs (page.*/expect) produce no JSON steps,
// so the screenshot would be lost. This reads it independently of steps.
export function extractFailureScreenshot(raw: unknown): string | undefined {
	if (!isPwReport(raw)) return undefined;
	const specs: PwSpec[] = [];
	for (const suite of raw.suites) specs.push(...collectSpecs(suite));
	for (const spec of specs) {
		const result = getLastResult(spec);
		if (!result || !FAILING_STATUSES.has(result.status)) continue;
		const shot = result.attachments?.find(
			(a) => a.name === "screenshot" && a.path,
		);
		if (shot?.path) return shot.path;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapPlaywrightReport(raw: unknown, ctx: ReportContext): Report {
	if (!isPwReport(raw)) {
		throw new Error("mapPlaywrightReport: invalid Playwright report shape");
	}

	// Collect all specs recursively across top-level suites
	const allSpecs: PwSpec[] = [];
	for (const suite of raw.suites) {
		allSpecs.push(...collectSpecs(suite));
	}

	// For each spec, grab the last result of the first test
	const results: PwResult[] = [];
	for (const spec of allSpecs) {
		const result = getLastResult(spec);
		if (result) results.push(result);
	}

	// Determine overall status
	const overallStatus: RunStatus = results.some((r) =>
		FAILING_STATUSES.has(r.status),
	)
		? "failed"
		: "passed";

	// Sum durations
	const durationMs = results.reduce((sum, r) => sum + r.duration, 0);

	// Flatten steps across all results, assigning sequential index
	const steps: ReportStep[] = [];
	let stepIndex = 0;

	for (const result of results) {
		const isFailed = FAILING_STATUSES.has(result.status);
		const screenshotAttachment = isFailed
			? result.attachments?.find((a) => a.name === "screenshot")
			: undefined;

		for (const pwStep of result.steps ?? []) {
			const stepFailed = pwStep.error !== undefined;
			const stepStatus: StepStatus = stepFailed ? "failed" : "passed";

			const step: ReportStep = {
				index: stepIndex++,
				title: pwStep.title,
				status: stepStatus,
				durationMs: pwStep.duration,
			};

			if (stepFailed && pwStep.error?.message !== undefined) {
				step.error = pwStep.error.message;
			}

			if (stepFailed && screenshotAttachment?.path !== undefined) {
				step.screenshotPath = screenshotAttachment.path;
			}

			steps.push(step);
		}
	}

	return {
		runId: ctx.runId,
		scenarioId: ctx.scenarioId,
		scenarioName: ctx.scenarioName,
		projectId: ctx.projectId,
		tunnelId: ctx.tunnelId,
		environmentId: ctx.environmentId,
		mode: ctx.mode,
		environmentLabel: ctx.environmentLabel,
		status: overallStatus,
		durationMs,
		startedAt: ctx.startedAt ?? "",
		steps,
	};
}
