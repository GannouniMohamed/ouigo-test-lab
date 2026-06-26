import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maestroRecorder } from "../../src/main/recorder/maestroRecorder";
import * as projectStore from "../../src/main/stores/projectStore";
import { getScenario } from "../../src/main/stores/scenarioStore";
import type { Project } from "../../src/shared/types";

let dir: string;

function seedProject(): void {
	const project: Project = {
		id: "p1",
		name: "P",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" },
			},
		],
	};
	projectStore.saveProject(project);
}

function recordingFolder(recordingId: string): string {
	return join(dir, "recordings", recordingId);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrec-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_SKIP_STUDIO_LAUNCH = "1";
	seedProject();
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_SKIP_STUDIO_LAUNCH"])
		Reflect.deleteProperty(process.env, k);
});

describe("maestroRecorder.startRecording", () => {
	it("crée un workspace pré-amorcé avec l'appId et renvoie un recordingId", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Mon parcours",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		expect(recordingId).toBeTruthy();
		const folder = recordingFolder(recordingId);
		expect(existsSync(folder)).toBe(true);
		const seed = readdirSync(folder).find((f) => f.endsWith(".yaml"));
		expect(seed).toBeTruthy();
		expect(readFileSync(join(folder, seed as string), "utf-8")).toContain(
			"appId: com.ouigo.app",
		);
	});

	it("sans deviceId → erreur", async () => {
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
			}),
		).rejects.toThrow(/appareil/i);
	});

	it("env sans app mobile → erreur", async () => {
		projectStore.saveProject({
			id: "p2",
			name: "P2",
			description: "",
			createdAt: "2026-06-26T00:00:00Z",
			environments: [{ id: "e", label: "E", baseURL: "", variables: {} }],
		});
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "e",
				projectId: "p2",
				tunnelId: "general",
				deviceId: "emulator-5554",
			}),
		).rejects.toThrow(/application/i);
	});
});

describe("maestroRecorder.stopRecording", () => {
	it("importe le flow le plus récent, rebase l'appId et crée le scénario", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Réservation",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		// simule l'export de Studio : un flow enregistré (appId d'un autre env)
		writeFileSync(
			join(recordingFolder(recordingId), "recorded.yaml"),
			'appId: com.autre.enregistre\n---\n- launchApp\n- tapOn: "Réserver"\n',
		);
		const scenario = await maestroRecorder.stopRecording(recordingId);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile).toBe(`${scenario.id}.flow.yaml`);
		expect(scenario.recordedStepCount).toBe(2);
		// persisté + appId rebasé vers l'env de l'enregistrement
		const saved = getScenario("p1", "general", scenario.id);
		expect(saved.name).toBe("Réservation");
		const spec = readFileSync(
			join(
				dir,
				"projects",
				"p1",
				"tunnels",
				"general",
				"scenarios",
				scenario.id,
				scenario.specFile,
			),
			"utf-8",
		);
		expect(spec).toContain("appId: com.ouigo.app");
		expect(spec).not.toContain("com.autre.enregistre");
	});

	it("rien enregistré (seul le seed pré-amorcé subsiste) → erreur, pas de scénario à 0 étape", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Vide",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		// On ne touche à rien : le seed (en-tête + commentaire, 0 commande) est le
		// seul fichier — c'est le cas réaliste « j'ai oublié d'enregistrer ».
		await expect(maestroRecorder.stopRecording(recordingId)).rejects.toThrow(
			/flow/i,
		);
	});

	it("dossier vide → erreur", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Vide",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		const folder = recordingFolder(recordingId);
		for (const f of readdirSync(folder)) rmSync(join(folder, f));
		await expect(maestroRecorder.stopRecording(recordingId)).rejects.toThrow(
			/flow/i,
		);
	});

	it("mtime identique entre le seed et le flow enregistré → c'est le flow réel qui gagne", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Réservation",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		const folder = recordingFolder(recordingId);
		writeFileSync(
			join(folder, "recorded.yaml"),
			'appId: com.autre.enregistre\n---\n- launchApp\n- tapOn: "Réserver"\n',
		);
		// Force des mtimes strictement identiques sur le seed et l'export : sur un
		// FS à granularité grossière (ext4/NTFS) l'égalité est réaliste. Le seed
		// (0 commande) ne doit jamais gagner.
		const t = new Date("2026-06-26T12:00:00Z");
		utimesSync(join(folder, "flow.yaml"), t, t);
		utimesSync(join(folder, "recorded.yaml"), t, t);
		const scenario = await maestroRecorder.stopRecording(recordingId);
		expect(scenario.recordedStepCount).toBe(2);
	});
});
