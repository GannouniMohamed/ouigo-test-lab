import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type {
	Environment,
	Report,
	RunEvent,
	RunOptions,
	RunResult,
	Scenario,
} from "../../shared/types";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { quoteForCmd, toolBin } from "../mobile/exec";
import { saveReport } from "../stores/reportStore";
import { updateLastRun } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { buildMaestroReport } from "./maestroReportMapper";
import type { TestRunner } from "./types";

interface RunState {
	child: ChildProcess;
	cancelled: boolean;
}
const activeRuns = new Map<string, RunState>();
const isWindows = process.platform === "win32";

// Rapport d'échec minimal mappé (même esprit que buildMinimalFailedReport du
// chemin web) : une seule étape portant le message humain.
function failedReport(
	runId: string,
	scenario: Scenario,
	env: Environment,
	startedAt: string,
	durationMs: number,
	error: string,
): Report {
	return {
		runId,
		scenarioId: scenario.id,
		scenarioName: scenario.name,
		projectId: scenario.projectId,
		tunnelId: scenario.tunnelId,
		environmentId: env.id,
		environmentLabel: env.label,
		status: "failed",
		durationMs,
		startedAt,
		steps: [
			{
				index: 0,
				title: "Préparation du run mobile",
				status: "failed",
				durationMs,
				error,
			},
		],
	};
}

function persist(
	scenario: Scenario,
	report: Report,
	startedAt: string,
	onEvent: (e: RunEvent) => void,
): RunResult {
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
	return {
		runId: report.runId,
		status: report.status,
		durationMs: report.durationMs,
		report,
	};
}

export const maestroRunner: TestRunner = {
	async run(
		scenario: Scenario,
		env: Environment,
		onEvent: (e: RunEvent) => void,
		opts?: RunOptions,
	): Promise<RunResult> {
		const runId = randomUUID();
		const startedAt = new Date().toISOString();
		const beginMs = Date.now();
		const runDir = join(getWorkspaceDir(), "runs", runId);
		mkdirSync(runDir, { recursive: true });

		// Garde-fous → rapports d'échec mappés (jamais d'exception).
		const guard = async (error: string): Promise<RunResult> => {
			const report = failedReport(runId, scenario, env, startedAt, 0, error);
			onEvent({
				type: "run-started",
				runId,
				totalSteps: 1,
				steps: [report.steps[0].title],
			});
			// Cède le tick après run-started (qui résout la promesse côté IPC). La
			// livraison live d'un run terminé instantanément est finalisée en Phase 6
			// (LiveRun récupère le rapport persisté au montage + validation amont).
			await Promise.resolve();
			onEvent({ type: "step-started", index: 0, title: report.steps[0].title });
			onEvent({ type: "step-failed", index: 0, error });
			return persist(scenario, report, startedAt, onEvent);
		};

		if (!env.app?.appId)
			return guard(
				"Aucune application mobile configurée pour cet environnement.",
			);
		const deviceId = opts?.deviceId;
		if (!deviceId)
			return guard(
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.",
			);

		// Prépare l'app sur l'appareil : "installed" no-op, "firebase" pull+install.
		const prep = await ensureAppOnDevice(env, deviceId);
		if (!prep.ok) return guard(prep.error);

		// Flow effectif : rebase l'appId d'en-tête vers l'app de l'env de run.
		const scenarioDir = join(
			getWorkspaceDir(),
			"projects",
			scenario.projectId,
			"tunnels",
			scenario.tunnelId,
			"scenarios",
			scenario.id,
		);
		const rawFlow = readFileSync(join(scenarioDir, scenario.specFile), "utf-8");
		const flow = rebaseFlowAppId(rawFlow, env.app.appId);
		const flowPath = join(runDir, scenario.specFile);
		writeFileSync(flowPath, flow, "utf-8");
		const junitPath = join(runDir, "report.xml");

		const planTitles = parseFlowSteps(flow).map((s) => s.title);
		onEvent({
			type: "run-started",
			runId,
			totalSteps: planTitles.length,
			steps: planTitles,
		});

		// Spawn maestro (injectable via OTL_MAESTRO_BIN[_ARGS], cf. OTL_CODEGEN).
		const bin = toolBin("maestro");
		const prefixArgs = process.env.OTL_MAESTRO_BIN_ARGS
			? [process.env.OTL_MAESTRO_BIN_ARGS]
			: [];
		const args = [
			...prefixArgs,
			"--device",
			deviceId,
			"test",
			"--format",
			"junit",
			"--output",
			junitPath,
			"--debug-output",
			runDir,
			flowPath,
		];

		let stdout = "";
		// detached:!isWindows → l'enfant devient leader de groupe pour que le kill
		// par groupe (process.kill(-pid)) de cancel() atteigne tout l'arbre Maestro
		// (JVM/driver/adb). Sur Windows, taskkill /T couvre déjà l'arbre.
		// Sous shell:true (Windows), citer bin + args pour gérer les chemins avec
		// espaces (runDir/flow sous le profil utilisateur). Cf. exec.quoteForCmd.
		const child = spawn(
			isWindows ? quoteForCmd(bin) : bin,
			isWindows ? args.map(quoteForCmd) : args,
			{ env: process.env, detached: !isWindows, shell: isWindows },
		);
		const state: RunState = { child, cancelled: false };
		activeRuns.set(runId, state);

		// StringDecoder (un par flux) : un glyphe UTF-8 ✅/❌ (3 octets) peut être
		// coupé entre deux chunks Buffer ; toString() par chunk le corromprait et
		// fausserait le parsing d'étapes. Le decoder recolle les octets partiels.
		const outDecoder = new StringDecoder("utf8");
		const errDecoder = new StringDecoder("utf8");
		const handleText = (s: string) => {
			if (!s) return;
			stdout += s;
			for (const line of s.split("\n"))
				if (line.trim()) onEvent({ type: "log", line });
		};
		child.stdout?.on("data", (b: Buffer) => handleText(outDecoder.write(b)));
		child.stderr?.on("data", (b: Buffer) => handleText(errDecoder.write(b)));

		return new Promise<RunResult>((resolve) => {
			let settled = false;
			const finish = (report: Report) => {
				if (settled) return;
				settled = true;
				activeRuns.delete(runId);
				if (state.cancelled) report.status = "cancelled";
				report.batchId = opts?.batchId;
				// Émet les événements par étape depuis le rapport construit (le stdout
				// Maestro n'est pas un protocole live stable → le rapport fait foi).
				for (const step of report.steps) {
					if (step.status === "skipped") {
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
					if (step.status === "failed")
						onEvent({
							type: "step-failed",
							index: step.index,
							error: step.error ?? "Échec",
						});
					else
						onEvent({
							type: "step-passed",
							index: step.index,
							durationMs: step.durationMs,
						});
				}
				resolve(persist(scenario, report, startedAt, onEvent));
			};

			child.on("error", () => {
				finish(
					failedReport(
						runId,
						scenario,
						env,
						startedAt,
						Date.now() - beginMs,
						"Impossible de démarrer Maestro (commande introuvable).",
					),
				);
			});
			child.on("close", () => {
				handleText(outDecoder.end());
				handleText(errDecoder.end());
				const durationMs = Date.now() - beginMs;
				let junitXml = "";
				try {
					junitXml = readFileSync(junitPath, "utf-8");
				} catch {
					/* pas de rapport → JUnit vide = échec mappé par le mapper */
				}
				const report = buildMaestroReport(
					{
						runId,
						scenarioId: scenario.id,
						scenarioName: scenario.name,
						projectId: scenario.projectId,
						tunnelId: scenario.tunnelId,
						environmentId: env.id,
						environmentLabel: env.label,
						startedAt,
						durationMs,
						planTitles,
					},
					stdout,
					junitXml,
				);
				finish(report);
			});
		});
	},

	async cancel(runId: string): Promise<void> {
		const state = activeRuns.get(runId);
		if (!state) return;
		state.cancelled = true;
		const pid = state.child.pid;
		if (pid === undefined) return;
		if (isWindows) spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
		else {
			try {
				process.kill(-pid, "SIGKILL");
			} catch {
				try {
					state.child.kill("SIGKILL");
				} catch {
					/* déjà mort */
				}
			}
		}
	},
};
