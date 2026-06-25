import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { deviceEnvFor } from "../../shared/devices";
import {
	compileSpecForMode,
	parseRecordedSteps,
	rebaseSpecUrls,
} from "../../shared/spec";
import type {
	Environment,
	Report,
	ReportStep,
	RunEvent,
	RunMode,
	RunOptions,
	RunResult,
	Scenario,
	StepStatus,
} from "../../shared/types";
import { stepActiveInMode } from "../../shared/types";
import { getEnvironment } from "../stores/projectStore";
import { saveReport } from "../stores/reportStore";
import { updateLastRun } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { extractFailureScreenshot, mapPlaywrightReport } from "./reportMapper";
import { alignStepsToRecorded } from "./stepAlign";
import type { TestRunner } from "./types";

interface RunState {
	child: ChildProcess;
	cancelled: boolean;
}

const activeRuns = new Map<string, RunState>();

export function readCustomSteps(stepsOut: string): ReportStep[] | null {
	if (!existsSync(stepsOut)) return null;
	try {
		const raw = JSON.parse(readFileSync(stepsOut, "utf-8")) as Array<{
			title: string;
			durationMs?: number;
			status?: string;
			error?: string;
		}>;
		if (!Array.isArray(raw)) return null;
		return raw.map((s, index) => {
			const step: ReportStep = {
				index,
				title: s.title,
				status: (s.status === "failed" ? "failed" : "passed") as StepStatus,
				durationMs: typeof s.durationMs === "number" ? s.durationMs : 0,
			};
			if (s.error) step.error = s.error;
			return step;
		});
	} catch {
		return null;
	}
}

function buildMinimalFailedReport(ctx: {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	projectId?: string;
	tunnelId?: string;
	environmentLabel: string;
	startedAt: string;
	durationMs: number;
	error: string;
}): Report {
	return {
		runId: ctx.runId,
		scenarioId: ctx.scenarioId,
		scenarioName: ctx.scenarioName,
		projectId: ctx.projectId,
		tunnelId: ctx.tunnelId,
		environmentLabel: ctx.environmentLabel,
		status: "failed",
		durationMs: ctx.durationMs,
		startedAt: ctx.startedAt,
		steps: [
			{
				index: 0,
				title: "Playwright process error",
				status: "failed",
				durationMs: ctx.durationMs,
				error: ctx.error,
			},
		],
	};
}

function splitLines(buffer: string, partial: { value: string }): string[] {
	const combined = partial.value + buffer;
	const lines = combined.split("\n");
	partial.value = lines.pop() ?? "";
	return lines;
}

const isWindows = process.platform === "win32";

export const playwrightRunner: TestRunner = {
	async run(
		scenario: Scenario,
		env: Environment,
		onEvent: (e: RunEvent) => void,
		opts?: RunOptions,
	): Promise<RunResult> {
		const runId = randomUUID();
		const startedAt = new Date().toISOString();

		const runDir = join(getWorkspaceDir(), "runs", runId);
		const artifactsDir = join(runDir, "artifacts");
		mkdirSync(runDir, { recursive: true });
		mkdirSync(artifactsDir, { recursive: true });

		const jsonOut = join(runDir, "playwright.json");
		const stepsOut = join(runDir, "steps.json");
		const scenarioDir = join(
			getWorkspaceDir(),
			"projects",
			scenario.projectId,
			"tunnels",
			scenario.tunnelId,
			"scenarios",
			scenario.id,
		);

		const configPath =
			process.env.OTL_RUNNER_CONFIG ??
			join(process.cwd(), "playwright.runner.config.ts");

		// Ensure spec files copied to the workspace can resolve @playwright/test
		// even though they live outside the project's node_modules directory.
		const configNodeModules = resolve(dirname(configPath), "node_modules");
		const existingNodePath = process.env.NODE_PATH;
		const nodePath = existingNodePath
			? `${configNodeModules}${delimiter}${existingNodePath}`
			: configNodeModules;

		// Headed by default (matches recording, so consent banners render); the
		// run-options dialog can request headless. OTL_FORCE_HEADLESS=1 always
		// wins — CI/e2e set it so runs never try to open a window on a display-
		// less machine. The config reads OTL_HEADLESS ("0" = headed).
		const headless =
			process.env.OTL_FORCE_HEADLESS === "1" || opts?.headed === false;
		const mode: RunMode = headless ? "invisible" : "visible";

		// Source spec: a draft (step-management "Relancer") or the stored spec.
		// Compile it for the mode (activate applicable steps, comment the rest)
		// and run THAT — written into the isolated run dir.
		const rawSource =
			opts?.specDraft ??
			readFileSync(join(scenarioDir, scenario.specFile), "utf-8");
		// Recorded specs hardcode the absolute URL captured at record time, so they
		// ignore the selected env. Rebase from the recorded env's baseURL to this
		// run's env so switching env actually redirects the navigation. The recorded
		// env may have been deleted — degrade to no rebase rather than failing.
		let recordedBaseURL = "";
		try {
			recordedBaseURL = getEnvironment(
				scenario.projectId,
				scenario.defaultEnvironmentId,
			).baseURL;
		} catch {
			/* recorded env gone — leave spec URLs untouched */
		}
		const source = rebaseSpecUrls(rawSource, recordedBaseURL, env.baseURL);
		const recordedSteps = parseRecordedSteps(source);
		// The planned steps that will ACTUALLY execute in this mode, in order.
		// This length matches what the reporter emits (kept steps), so LiveRun can
		// render the complete parcours from the start and align live markers to it.
		const planTitles = recordedSteps
			.filter((s) => stepActiveInMode(s.scope, mode))
			.map((s) => s.title);
		writeFileSync(
			join(runDir, scenario.specFile),
			compileSpecForMode(source, mode),
			"utf-8",
		);

		const childEnv: NodeJS.ProcessEnv = {
			...process.env,
			PLAYWRIGHT_BASE_URL: env.baseURL,
			OTL_TEST_DIR: runDir,
			OTL_JSON_OUT: jsonOut,
			OTL_STEPS_OUT: stepsOut,
			OTL_ARTIFACTS: artifactsDir,
			OTL_HEADLESS: headless ? "1" : "0",
			NODE_PATH: nodePath,
			// "responsive" scenarios replay in a mobile (iPhone) viewport; the
			// runner config reads OTL_DEVICE and emulates it on Chromium.
			...deviceEnvFor(scenario.platform),
			...env.variables,
		};

		// Injectable, platform-correct npx command (OTL_NPX allows test overrides)
		const npxCmd = process.env.OTL_NPX ?? (isWindows ? "npx.cmd" : "npx");

		onEvent({
			type: "run-started",
			runId,
			totalSteps: planTitles.length,
			steps: planTitles,
		});

		const runBeginMs = Date.now();

		const child = spawn(
			npxCmd,
			["playwright", "test", scenario.specFile, "--config", configPath],
			{
				cwd: dirname(configPath),
				env: childEnv,
				detached: !isWindows,
				// Windows: spawning npx.cmd requires a shell (Node throws EINVAL on
				// .cmd/.bat without it since the CVE-2024-27980 patch).
				shell: isWindows,
			},
		);

		const state: RunState = { child, cancelled: false };
		activeRuns.set(runId, state);

		const partialStdout = { value: "" };
		const partialStderr = { value: "" };

		// Live step streaming: the reporter prints `__OTL_STEP__{json}` markers on
		// onStepBegin/onStepEnd for each kept step. We translate them to live
		// step events so LiveRun lights up the parcours in real time. `liveIndex`
		// is incremented on each "begin" so begin/end pair to the same row.
		const STEP_MARKER = "__OTL_STEP__";
		let liveIndex = -1;
		let liveStreamed = false;

		function handleStepMarker(payload: string): void {
			let parsed: {
				phase?: string;
				title?: string;
				status?: string;
				durationMs?: number;
				error?: string;
			};
			try {
				parsed = JSON.parse(payload);
			} catch {
				return;
			}
			if (parsed.phase === "begin") {
				liveStreamed = true;
				liveIndex += 1;
				onEvent({
					type: "step-started",
					index: liveIndex,
					title: typeof parsed.title === "string" ? parsed.title : "",
				});
			} else if (parsed.phase === "end") {
				if (liveIndex < 0) return;
				if (parsed.status === "failed") {
					onEvent({
						type: "step-failed",
						index: liveIndex,
						error:
							typeof parsed.error === "string" && parsed.error
								? parsed.error
								: "Échec de l'étape",
					});
				} else {
					onEvent({
						type: "step-passed",
						index: liveIndex,
						durationMs:
							typeof parsed.durationMs === "number" ? parsed.durationMs : 0,
					});
				}
			}
		}

		child.stdout?.on("data", (data: Buffer) => {
			const lines = splitLines(data.toString(), partialStdout);
			for (const line of lines) {
				if (line.startsWith(STEP_MARKER)) {
					handleStepMarker(line.slice(STEP_MARKER.length));
					continue;
				}
				if (line.trim()) onEvent({ type: "log", line });
			}
		});

		child.stderr?.on("data", (data: Buffer) => {
			const lines = splitLines(data.toString(), partialStderr);
			for (const line of lines) {
				if (line.trim()) onEvent({ type: "log", line });
			}
		});

		return new Promise<RunResult>((resolve) => {
			let settled = false;

			function finishWith(report: Report, emitSteps: boolean): void {
				if (settled) return;
				settled = true;
				activeRuns.delete(runId);

				if (emitSteps) {
					// Emit per-step events
					for (const step of report.steps) {
						if (step.status === "skipped") {
							// Recorded action the run never reached — surface it as
							// "non atteint" rather than a stuck or falsely-passed step.
							onEvent({
								type: "step-skipped",
								index: step.index,
								title: step.title,
							});
							continue;
						}
						onEvent({
							type: "step-started",
							index: step.index,
							title: step.title,
						});
						if (step.status === "failed") {
							onEvent({
								type: "step-failed",
								index: step.index,
								error: step.error ?? "unknown error",
								screenshot: step.screenshotPath,
							});
						} else {
							onEvent({
								type: "step-passed",
								index: step.index,
								durationMs: step.durationMs,
							});
						}
					}
				}

				saveReport(report);
				updateLastRun(scenario.projectId, scenario.tunnelId, scenario.id, {
					status: report.status === "passed" ? "passed" : "failed",
					at: startedAt,
					durationMs: report.durationMs,
					stepCount: report.steps.length,
				});
				onEvent({
					type: "run-finished",
					status: report.status,
					durationMs: report.durationMs,
				});
				resolve({
					runId,
					status: report.status,
					durationMs: report.durationMs,
					report,
				});
			}

			child.on("error", () => {
				const durationMs = Date.now() - runBeginMs;
				const report = buildMinimalFailedReport({
					runId,
					scenarioId: scenario.id,
					scenarioName: scenario.name,
					projectId: scenario.projectId,
					tunnelId: scenario.tunnelId,
					environmentLabel: env.label,
					startedAt,
					durationMs,
					error: "Impossible de démarrer Playwright (commande introuvable)",
				});
				report.batchId = opts?.batchId;
				if (state.cancelled) report.status = "cancelled";
				finishWith(report, false);
			});

			child.on("close", () => {
				const durationMs = Date.now() - runBeginMs;

				// Flush any remaining partial lines
				if (partialStdout.value.startsWith(STEP_MARKER)) {
					handleStepMarker(partialStdout.value.slice(STEP_MARKER.length));
				} else if (partialStdout.value.trim()) {
					onEvent({ type: "log", line: partialStdout.value });
				}
				if (partialStderr.value.trim()) {
					onEvent({ type: "log", line: partialStderr.value });
				}

				let raw: unknown;
				try {
					raw = JSON.parse(readFileSync(jsonOut, "utf-8"));
				} catch {
					// Playwright crashed without producing JSON
					const report = buildMinimalFailedReport({
						runId,
						scenarioId: scenario.id,
						scenarioName: scenario.name,
						projectId: scenario.projectId,
						tunnelId: scenario.tunnelId,
						environmentLabel: env.label,
						startedAt,
						durationMs,
						error: "Playwright exited without producing a JSON report",
					});

					report.batchId = opts?.batchId;
					if (state.cancelled) report.status = "cancelled";
					finishWith(report, false);
					return;
				}

				const report = mapPlaywrightReport(raw, {
					runId,
					scenarioId: scenario.id,
					scenarioName: scenario.name,
					projectId: scenario.projectId,
					tunnelId: scenario.tunnelId,
					environmentId: env.id,
					mode,
					environmentLabel: env.label,
					startedAt,
				});
				report.batchId = opts?.batchId;

				// Capture screenshot from JSON-mapped report before potentially overriding steps
				const failedJsonStep = report.steps.find(
					(s) => s.status === "failed" && s.screenshotPath !== undefined,
				);
				// Prefer the screenshot already mapped onto a JSON step; otherwise
				// read it from the result-level attachment (flat specs have no JSON
				// steps, so the screenshot would otherwise be lost — "Capture
				// indisponible" despite the PNG existing on disk).
				const preservedScreenshot =
					failedJsonStep?.screenshotPath ?? extractFailureScreenshot(raw);

				// Build the step list from the recorded scenario as the backbone so a
				// failed/partial run still shows the COMPLETE recorded flow with the
				// block point located. The custom reporter gives the real per-action
				// outcomes (the JSON reporter omits flat page.*/expect steps); recorded
				// actions the run never reached are surfaced as "skipped" (non atteint).
				const customSteps = readCustomSteps(stepsOut);
				const executedSteps =
					customSteps && customSteps.length > 0 ? customSteps : report.steps;

				if (recordedSteps.length > 0 || executedSteps.length > 0) {
					const aligned = alignStepsToRecorded(
						recordedSteps,
						executedSteps,
						mode,
					);
					// Carry the failure screenshot to the first failed step.
					if (preservedScreenshot !== undefined) {
						const firstFailed = aligned.find((s) => s.status === "failed");
						if (firstFailed !== undefined)
							firstFailed.screenshotPath = preservedScreenshot;
					}
					report.steps = aligned;
				}

				if (state.cancelled) report.status = "cancelled";

				// When live markers streamed the per-step events already, don't
				// re-emit them (would double the rows). The report is still built and
				// persisted as today. Fallback path (no markers) keeps the burst.
				finishWith(report, !liveStreamed);
			});
		});
	},

	async cancel(runId: string): Promise<void> {
		const state = activeRuns.get(runId);
		if (!state) return;
		state.cancelled = true;
		const pid = state.child.pid;
		if (pid === undefined) return;
		if (isWindows) {
			// Kill the whole tree on Windows
			spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
		} else {
			try {
				// kill the whole process group (negative pid) — covers playwright workers
				process.kill(-pid, "SIGKILL");
			} catch {
				// fallback: kill just the child
				try {
					state.child.kill("SIGKILL");
				} catch {
					/* already dead */
				}
			}
		}
	},
};
