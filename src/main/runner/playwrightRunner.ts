import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import type {
	Environment,
	Report,
	RunEvent,
	RunResult,
	Scenario,
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
		const scenarioDir = join(getWorkspaceDir(), "scenarios", scenario.id);

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
			OTL_ARTIFACTS: artifactsDir,
			NODE_PATH: nodePath,
			...env.variables,
		};

		onEvent({ type: "run-started", runId });

		const runBeginMs = Date.now();

		const child = spawn(
			"npx",
			["playwright", "test", scenario.specFile, "--config", configPath],
			{ cwd: dirname(configPath), env: childEnv, detached: true },
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
			child.on("close", () => {
				activeRuns.delete(runId);

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

					saveReport(report);
					updateLastRun(scenario.id, {
						status: report.status === "passed" ? "passed" : "failed",
						at: startedAt,
						durationMs: report.durationMs,
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
					return;
				}

				const report = mapPlaywrightReport(raw, {
					runId,
					scenarioId: scenario.id,
					scenarioName: scenario.name,
					environmentLabel: env.label,
					startedAt,
				});

				if (state.cancelled) report.status = "cancelled";

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

				saveReport(report);
				updateLastRun(scenario.id, {
					status: report.status === "passed" ? "passed" : "failed",
					at: startedAt,
					durationMs: report.durationMs,
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
			});
		});
	},

	async cancel(runId: string): Promise<void> {
		const state = activeRuns.get(runId);
		if (!state) return;
		state.cancelled = true;
		const pid = state.child.pid;
		if (pid !== undefined) {
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
