import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Platform, Scenario } from "../../shared/types";
import { getEnvironment } from "../stores/projectStore";
import { getScenario, saveScenario } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { slugify } from "./slugify";

interface RecordingSession {
	child: ChildProcess;
	outFile: string;
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
	platform: Platform;
}

const activeRecordings = new Map<string, RecordingSession>();

const isWindows = process.platform === "win32";

function killProcessTree(child: ChildProcess): void {
	const pid = child.pid;
	if (pid === undefined) return;
	if (isWindows) {
		spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
	} else {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			try {
				child.kill("SIGKILL");
			} catch {
				/* already dead */
			}
		}
	}
}

function waitForExitOrTimeout(child: ChildProcess, ms: number): Promise<void> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve();
		};
		child.once("exit", finish);
		child.once("close", finish);
		setTimeout(finish, ms);
	});
}

function uniqueId(projectId: string, tunnelId: string, base: string): string {
	let candidate = base;
	let counter = 2;
	while (true) {
		try {
			getScenario(projectId, tunnelId, candidate);
			candidate = `${base}-${counter}`;
			counter++;
		} catch {
			return candidate;
		}
	}
}

export const playwrightRecorder = {
	async startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
		platform?: Platform;
	}): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
		const recordingId = randomUUID();

		const recordingsDir = join(getWorkspaceDir(), "recordings");
		mkdirSync(recordingsDir, { recursive: true });
		const outFile = join(recordingsDir, `${recordingId}.spec.ts`);

		const cmd = process.env.OTL_CODEGEN ?? (isWindows ? "npx.cmd" : "npx");

		let args: string[];
		if (process.env.OTL_CODEGEN) {
			args = [
				process.env.OTL_CODEGEN_ARGS,
				env.baseURL,
				"--target",
				"playwright-test",
				"-o",
				outFile,
			].filter(Boolean) as string[];
		} else {
			args = [
				"playwright",
				"codegen",
				env.baseURL,
				"--target",
				"playwright-test",
				"-o",
				outFile,
			];
		}

		const child = spawn(cmd, args, {
			env: process.env,
			detached: !isWindows,
			shell: isWindows,
		});

		activeRecordings.set(recordingId, {
			child,
			outFile,
			name: opts.name,
			browser: opts.browser,
			environmentId: opts.environmentId,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
			platform: opts.platform ?? "web",
		});

		return { recordingId };
	},

	async stopRecording(recordingId: string): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session) {
			throw new Error(`Recording not found: ${recordingId}`);
		}

		// IMPORTANT: wait for codegen to have produced its output file BEFORE
		// killing it. Killing first races against the codegen process even
		// starting up — on a fast machine the kill lands before any output is
		// written, so the file never appears. Playwright codegen writes the
		// output file on launch (and live as you record), so polling for it
		// first is safe and removes the race.
		const pollIntervalMs = 50;
		const maxWaitMs = 10000;
		const start = Date.now();
		while (!existsSync(session.outFile)) {
			if (Date.now() - start > maxWaitMs) {
				killProcessTree(session.child);
				activeRecordings.delete(recordingId);
				throw new Error(
					`Timed out waiting for codegen output file: ${session.outFile}`,
				);
			}
			await new Promise((r) => setTimeout(r, pollIntervalMs));
		}

		// Graceful stop: let codegen flush its throttled output (BeforeClose/exit)
		// before we read, so the last recorded action is not lost.
		const pid = session.child.pid;
		if (!isWindows && pid !== undefined) {
			try {
				process.kill(-pid, "SIGTERM");
			} catch {
				/* already gone */
			}
		}
		await waitForExitOrTimeout(session.child, 700);

		const specContent = readFileSync(session.outFile, "utf-8");

		// Guarantee cleanup of any survivor.
		killProcessTree(session.child);

		const id = uniqueId(
			session.projectId,
			session.tunnelId,
			slugify(session.name),
		);

		const scenario: Scenario = {
			id,
			projectId: session.projectId,
			tunnelId: session.tunnelId,
			name: session.name,
			platform: session.platform,
			browser: session.browser,
			defaultEnvironmentId: session.environmentId,
			tags: [],
			specFile: `${id}.spec.ts`,
			createdAt: new Date().toISOString(),
			lastRun: { status: "never" },
		};

		saveScenario(scenario, specContent);
		activeRecordings.delete(recordingId);

		return scenario;
	},
};
