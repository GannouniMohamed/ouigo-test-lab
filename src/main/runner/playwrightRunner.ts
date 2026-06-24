import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import type {
	Environment,
	Report,
	ReportStep,
	RunEvent,
	RunResult,
	Scenario,
	StepStatus,
} from "../../shared/types";
import { saveReport } from "../stores/reportStore";
import { updateLastRun } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { mapPlaywrightReport } from "./reportMapper";
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
	environmentLabel: string;
	startedAt: string;
	durationMs: number;
	error: string;
}): Report {
	return {
		runId: ctx.runId,
		scenarioId: ctx.scenarioId,
		scenarioName: ctx.scenarioName,
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

		const childEnv: NodeJS.ProcessEnv = {
			...process.env,
			PLAYWRIGHT_BASE_URL: env.baseURL,
			OTL_TEST_DIR: scenarioDir,
			OTL_JSON_OUT: jsonOut,
			OTL_STEPS_OUT: stepsOut,
			OTL_ARTIFACTS: artifactsDir,
			NODE_PATH: nodePath,
			...env.variables,
		};

		// Injectable, platform-correct npx command (OTL_NPX allows test overrides)
		const npxCmd = process.env.OTL_NPX ?? (isWindows ? "npx.cmd" : "npx");

		onEvent({ type: "run-started", runId });

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

		child.stdout?.on("data", (data: Buffer) => {
			const lines = splitLines(data.toString(), partialStdout);
			for (const line of lines) {
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
					environmentLabel: env.label,
					startedAt,
					durationMs,
					error: "Impossible de démarrer Playwright (commande introuvable)",
				});
				if (state.cancelled) report.status = "cancelled";
				finishWith(report, false);
			});

			child.on("close", () => {
				const durationMs = Date.now() - runBeginMs;

				// Flush any remaining partial lines
				if (partialStdout.value.trim()) {
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
						environmentLabel: env.label,
						startedAt,
						durationMs,
						error: "Playwright exited without producing a JSON report",
					});

					if (state.cancelled) report.status = "cancelled";
					finishWith(report, false);
					return;
				}

				const report = mapPlaywrightReport(raw, {
					runId,
					scenarioId: scenario.id,
					scenarioName: scenario.name,
					environmentLabel: env.label,
					startedAt,
				});

				// Capture screenshot from JSON-mapped report before potentially overriding steps
				const failedJsonStep = report.steps.find(
					(s) => s.status === "failed" && s.screenshotPath !== undefined,
				);
				const preservedScreenshot = failedJsonStep?.screenshotPath;

				// Override report.steps with real recorded actions from custom reporter
				const customSteps = readCustomSteps(stepsOut);
				if (customSteps && customSteps.length > 0) {
					// Carry over the failure screenshot to the first failed custom step
					if (preservedScreenshot !== undefined) {
						const firstFailedCustomStep = customSteps.find(
							(s) => s.status === "failed",
						);
						if (firstFailedCustomStep !== undefined) {
							firstFailedCustomStep.screenshotPath = preservedScreenshot;
						}
					}
					report.steps = customSteps;
				}

				if (state.cancelled) report.status = "cancelled";

				finishWith(report, true);
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
