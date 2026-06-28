import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { normalizeFlow, parseFlowSteps } from "../../shared/flow";
import type { Environment, Scenario } from "../../shared/types";
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

// Ouvre Studio dans une fenêtre de l'app (lazy require → module reste
// electron-free à l'import ; les tests injectent openStudio).
function defaultOpenStudio(
	url: string,
	opts: { onClosed: () => void },
): { close: () => void } {
	const { openStudioWindow } = require("./studioWindow");
	return openStudioWindow(url, opts);
}

// Lit le presse-papier OS (sortie du bouton Copy du Studio). Lazy require.
function defaultReadClipboard(): string {
	try {
		return require("electron").clipboard.readText() ?? "";
	} catch {
		return "";
	}
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

/**
 * Tue tous les enregistrements Studio actifs et vide la map.
 * Appelé depuis index.ts lors du `before-quit` d'Electron.
 * Pas d'import electron ici → reste testable en vitest pur.
 */
export function killAllRecordings(): void {
	for (const session of activeRecordings.values()) {
		session.kill();
	}
	activeRecordings.clear();
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
			openStudio?: (
				url: string,
				opts: { onClosed: () => void },
			) => { close: () => void };
			ensureAppOnDevice?: (
				env: Environment,
				deviceId: string,
			) => Promise<{ ok: true } | { ok: false; error: string }>;
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
		const ensureApp = deps?.ensureAppOnDevice ?? ensureAppOnDevice;
		const prep = await ensureApp(env, opts.deviceId);
		if (!prep.ok) throw new Error(prep.error);

		const recordingId = randomUUID();
		let kill: () => void = () => {};

		// OTL_SKIP_STUDIO_LAUNCH court-circuite le lancement réel (dispatch/CI).
		if (process.env.OTL_SKIP_STUDIO_LAUNCH !== "1") {
			const spawnStudio = deps?.spawnStudio ?? defaultSpawnStudio;
			const waitForPort = deps?.waitForPort ?? defaultWaitForPort;
			const openStudio = deps?.openStudio ?? defaultOpenStudio;
			const handle = spawnStudio(bin, opts.deviceId);
			try {
				await waitForPort(STUDIO_URL, STUDIO_TIMEOUT_MS);
			} catch {
				handle.kill();
				throw new Error(
					"Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie.",
				);
			}
			const win = openStudio(STUDIO_URL, {
				onClosed: () => maestroRecorder.cancelRecording(recordingId),
			});
			kill = () => {
				handle.kill();
				win.close();
			};
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
		deps?: { readClipboard?: () => string },
	): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session)
			throw new Error(
				`Session d'enregistrement introuvable (${recordingId}) — elle a peut-être déjà été arrêtée ou annulée.`,
			);

		const pasted = (pastedFlow ?? "").trim();
		const raw =
			pasted || (deps?.readClipboard ?? defaultReadClipboard)().trim();
		const flow = normalizeFlow(raw, session.appId);

		// #8 valider AVANT de tuer/fermer : 0 étape → on laisse la session pour réessayer.
		if (parseFlowSteps(flow).length === 0) {
			throw new Error(
				"Aucune étape détectée — enregistre dans le Studio, clique Copy, puis Terminer.",
			);
		}

		session.kill(); // stoppe le serveur Studio ET ferme la fenêtre
		activeRecordings.delete(recordingId);

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
		return scenario;
	},

	cancelRecording(recordingId: string): void {
		const session = activeRecordings.get(recordingId);
		if (!session) return;
		session.kill();
		activeRecordings.delete(recordingId);
	},
};
