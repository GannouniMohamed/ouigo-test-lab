import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type { Scenario } from "../../shared/types";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { quoteArgForCmd, quoteForCmd } from "../mobile/exec";
import { ensureManagedMaestro } from "../mobile/managedMaestro";
import { getEnvironment } from "../stores/projectStore";
import { getScenario, saveScenario } from "../stores/scenarioStore";
import { slugify } from "./slugify";

const STUDIO_URL = "http://localhost:9999";
const STUDIO_TIMEOUT_MS = 30_000;
const isWindows = process.platform === "win32";

export interface StudioHandle {
	pid?: number;
	kill: () => void;
}

interface RecordingSession {
	name: string;
	projectId: string;
	tunnelId: string;
	environmentId: string;
	appId: string;
	kill: () => void;
}

const activeRecordings = new Map<string, RecordingSession>();

// Tue l'arbre de process Studio (JVM/driver). detached:!isWindows → kill par
// groupe ; Windows → taskkill /T. Même esprit que maestroRunner.cancel().
function killProc(child: ChildProcess): void {
	const pid = child.pid;
	if (pid === undefined) return;
	if (isWindows) spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
	else {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			try {
				child.kill("SIGKILL");
			} catch {
				/* déjà mort */
			}
		}
	}
}

// Construit les paramètres de spawn pour Maestro Studio, en version Windows-safe
// (quoting + shell:true) ou POSIX (brut + shell:false). Toujours stdio:"ignore"
// car Studio est long-running et rien ne lit ses sorties (évite le blocage du
// buffer OS). Exporté pour tests unitaires purs (pas de spawn réel).
export function studioSpawnInvocation(
	bin: string,
	deviceId: string,
	isWin = isWindows,
): {
	cmd: string;
	args: string[];
	options: { detached: boolean; shell: boolean; stdio: "ignore" };
} {
	const rawArgs = ["--device", deviceId, "studio", "--no-window"];
	if (isWin) {
		return {
			cmd: quoteForCmd(bin),
			args: rawArgs.map(quoteArgForCmd),
			options: { detached: false, shell: true, stdio: "ignore" },
		};
	}
	return {
		cmd: bin,
		args: rawArgs,
		options: { detached: true, shell: false, stdio: "ignore" },
	};
}

// Lance le serveur Studio web (long-running). Le flag --device cible l'appareil.
function defaultSpawnStudio(bin: string, deviceId: string): StudioHandle {
	const inv = studioSpawnInvocation(bin, deviceId);
	const child = spawn(inv.cmd, inv.args, inv.options);
	child.on("error", () => {});
	return { pid: child.pid, kill: () => killProc(child) };
}

// Attend que le serveur Studio réponde sur le port (toute réponse = prêt).
async function defaultWaitForPort(
	url: string,
	timeoutMs: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	throw new Error("timeout");
}

// Ouvre l'URL dans le navigateur système (pas d'import electron → testable).
function defaultOpenExternal(url: string): void {
	if (process.platform === "darwin") spawn("open", [url], { detached: true });
	else if (isWindows) spawn("cmd", ["/c", "start", "", url], { shell: true });
	else spawn("xdg-open", [url], { detached: true });
}

function uniqueId(projectId: string, tunnelId: string, base: string): string {
	let candidate = base;
	let n = 2;
	while (true) {
		try {
			getScenario(projectId, tunnelId, candidate);
			candidate = `${base}-${n++}`;
		} catch {
			return candidate;
		}
	}
}

export const maestroRecorder = {
	async startRecording(
		opts: {
			name: string;
			environmentId: string;
			projectId: string;
			tunnelId: string;
			deviceId?: string;
		},
		deps?: {
			ensureMaestro?: () => Promise<{ bin: string }>;
			spawnStudio?: (bin: string, deviceId: string) => StudioHandle;
			waitForPort?: (url: string, timeoutMs: number) => Promise<void>;
			openExternal?: (url: string) => void;
		},
	): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
		if (!env.app?.appId)
			throw new Error(
				"Aucune application mobile configurée pour cet environnement.",
			);
		if (!opts.deviceId)
			throw new Error(
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.",
			);

		// Garantit le binaire Maestro géré (télécharge la 1re fois).
		const ensure = deps?.ensureMaestro ?? ensureManagedMaestro;
		const { bin } = await ensure();

		// L'app doit être présente sur l'appareil pour que Studio l'inspecte.
		const prep = await ensureAppOnDevice(env, opts.deviceId);
		if (!prep.ok) throw new Error(prep.error);

		const recordingId = randomUUID();
		let kill: () => void = () => {};

		// OTL_SKIP_STUDIO_LAUNCH court-circuite le lancement réel (dispatch/CI).
		if (process.env.OTL_SKIP_STUDIO_LAUNCH !== "1") {
			const spawnStudio = deps?.spawnStudio ?? defaultSpawnStudio;
			const waitForPort = deps?.waitForPort ?? defaultWaitForPort;
			const openExternal = deps?.openExternal ?? defaultOpenExternal;
			const handle = spawnStudio(bin, opts.deviceId);
			kill = handle.kill;
			try {
				await waitForPort(STUDIO_URL, STUDIO_TIMEOUT_MS);
			} catch {
				handle.kill();
				throw new Error(
					"Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie.",
				);
			}
			openExternal(STUDIO_URL);
		}

		activeRecordings.set(recordingId, {
			name: opts.name,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
			environmentId: opts.environmentId,
			appId: env.app.appId,
			kill,
		});
		return { recordingId };
	},

	async stopRecording(
		recordingId: string,
		pastedFlow?: string,
	): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session) throw new Error(`Recording not found: ${recordingId}`);

		session.kill(); // stoppe le serveur Studio

		const raw = (pastedFlow ?? "").trim();
		if (!raw || parseFlowSteps(raw).length === 0) {
			activeRecordings.delete(recordingId);
			throw new Error(
				"Aucune étape détectée — colle bien le parcours copié depuis Maestro Studio.",
			);
		}

		const flow = rebaseFlowAppId(raw, session.appId);
		const steps = parseFlowSteps(flow);

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
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: session.environmentId,
			tags: [],
			specFile: `${id}.flow.yaml`,
			createdAt: new Date().toISOString(),
			recordedStepCount: steps.length,
			lastRun: { status: "never" },
		};
		saveScenario(scenario, flow);
		activeRecordings.delete(recordingId);
		return scenario;
	},

	cancelRecording(recordingId: string): void {
		const session = activeRecordings.get(recordingId);
		if (!session) return;
		session.kill();
		activeRecordings.delete(recordingId);
	},
};
