import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type { Scenario } from "../../shared/types";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { getEnvironment } from "../stores/projectStore";
import { getScenario, saveScenario } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { slugify } from "./slugify";

interface RecordingSession {
	folder: string;
	name: string;
	projectId: string;
	tunnelId: string;
	environmentId: string;
	appId: string;
}

const activeRecordings = new Map<string, RecordingSession>();
const isWindows = process.platform === "win32";

// Lance l'app Maestro Studio desktop sur le dossier et l'ouvre dans
// l'explorateur de fichiers. Désactivable en test via OTL_SKIP_STUDIO_LAUNCH.
function launchStudio(folder: string): void {
	if (process.env.OTL_SKIP_STUDIO_LAUNCH === "1") return;
	try {
		if (process.platform === "darwin") {
			spawn("open", ["-a", "Maestro Studio", folder], { detached: true });
			spawn("open", [folder], { detached: true });
		} else if (isWindows) {
			spawn("cmd", ["/c", "start", "", "maestro-studio"], { shell: true });
			spawn("explorer", [folder]);
		} else {
			spawn("xdg-open", [folder], { detached: true });
		}
	} catch {
		/* lancement best-effort — l'utilisateur peut ouvrir Studio à la main */
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

export const maestroRecorder = {
	async startRecording(opts: {
		name: string;
		environmentId: string;
		projectId: string;
		tunnelId: string;
		deviceId?: string;
	}): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
		if (!env.app?.appId)
			throw new Error(
				"Aucune application mobile configurée pour cet environnement.",
			);
		if (!opts.deviceId)
			throw new Error(
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.",
			);

		// L'app doit être présente sur l'appareil pour que Studio l'inspecte.
		const prep = await ensureAppOnDevice(env, opts.deviceId);
		if (!prep.ok) throw new Error(prep.error);

		const recordingId = randomUUID();
		const folder = join(getWorkspaceDir(), "recordings", recordingId);
		mkdirSync(folder, { recursive: true });
		// Pré-amorce un flow avec le bon appId : l'utilisateur enregistre dedans.
		writeFileSync(
			join(folder, "flow.yaml"),
			`appId: ${env.app.appId}\n---\n# Enregistre ton parcours dans Maestro Studio, puis reviens ici.\n`,
			"utf-8",
		);

		activeRecordings.set(recordingId, {
			folder,
			name: opts.name,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
			environmentId: opts.environmentId,
			appId: env.app.appId,
		});

		launchStudio(folder);
		return { recordingId };
	},

	async stopRecording(recordingId: string): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session) throw new Error(`Recording not found: ${recordingId}`);

		// Importe le flow .yaml/.yml non vide le plus récemment modifié.
		const candidates = readdirSync(session.folder)
			.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
			.map((f) => join(session.folder, f))
			.filter((p) => {
				try {
					return readFileSync(p, "utf-8").trim().length > 0;
				} catch {
					return false;
				}
			})
			.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

		if (candidates.length === 0) {
			activeRecordings.delete(recordingId);
			throw new Error(
				"Aucun flow détecté — as-tu enregistré dans le bon dossier ?",
			);
		}

		const raw = readFileSync(candidates[0], "utf-8");
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
};
