import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	killAllRecordings,
	maestroRecorder,
	studioSpawnInvocation,
} from "../../src/main/recorder/maestroRecorder";
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

function seedFirebaseProject(): void {
	const project: Project = {
		id: "pfb",
		name: "P Firebase",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod-fb",
				label: "Préprod Firebase",
				baseURL: "",
				variables: {},
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/fake/key.json",
					},
				},
			},
		],
	};
	projectStore.saveProject(project);
}

// Dépendances injectées : Studio « lancé » sans process réel.
function fakeDeps(overrides?: {
	ensureAppOnDevice?: () => Promise<
		{ ok: true } | { ok: false; error: string }
	>;
}) {
	const kill = vi.fn(); // process Studio
	const close = vi.fn(); // fenêtre embarquée
	let onClosed = () => {};
	return {
		kill,
		close,
		fireWindowClosed: () => onClosed(),
		deps: {
			ensureMaestro: vi.fn(async () => ({ bin: "/fake/maestro" })),
			spawnStudio: vi.fn(() => ({ pid: 4242, kill })),
			waitForPort: vi.fn(async () => {}),
			openStudio: vi.fn((_url: string, o: { onClosed: () => void }) => {
				onClosed = o.onClosed;
				return { close };
			}),
			ensureAppOnDevice:
				overrides?.ensureAppOnDevice ??
				vi.fn(async () => ({ ok: true as const })),
		},
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrec-"));
	process.env.OTL_WORKSPACE = dir;
	seedProject();
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("maestroRecorder.startRecording", () => {
	it("ouvre la fenêtre embarquée (pas navigateur externe) : openStudio appelé avec url + onClosed", async () => {
		const { deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "Mon parcours",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		expect(recordingId).toBeTruthy();
		expect(deps.ensureMaestro).toHaveBeenCalledTimes(1);
		expect(deps.spawnStudio).toHaveBeenCalledWith(
			"/fake/maestro",
			"emulator-5554",
		);
		expect(deps.waitForPort).toHaveBeenCalledWith(
			"http://localhost:9999",
			expect.any(Number),
		);
		expect(deps.openStudio).toHaveBeenCalledWith(
			"http://localhost:9999",
			expect.objectContaining({ onClosed: expect.any(Function) }),
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

	it("Studio ne démarre pas (timeout port) → erreur claire + process tué", async () => {
		const { kill, deps } = fakeDeps();
		deps.waitForPort = vi.fn(async () => {
			throw new Error("timeout");
		});
		await expect(
			maestroRecorder.startRecording(
				{
					name: "x",
					environmentId: "preprod",
					projectId: "p1",
					tunnelId: "general",
					deviceId: "emulator-5554",
				},
				deps,
			),
		).rejects.toThrow(/Studio n'a pas démarré/i);
		expect(kill).toHaveBeenCalledTimes(1);
	});

	it("#38 source:firebase + ensureAppOnDevice échoue → rejet avec message Firebase", async () => {
		seedFirebaseProject();
		const { deps } = fakeDeps({
			ensureAppOnDevice: vi.fn(async () => ({
				ok: false as const,
				error: "Firebase: réseau coupé",
			})),
		});
		await expect(
			maestroRecorder.startRecording(
				{
					name: "x",
					environmentId: "preprod-fb",
					projectId: "pfb",
					tunnelId: "general",
					deviceId: "emulator-5554",
				},
				deps,
			),
		).rejects.toThrow(/Firebase/i);
	});
});

describe("maestroRecorder.stopRecording", () => {
	async function start(overrideDeps?: ReturnType<typeof fakeDeps>) {
		const fd = overrideDeps ?? fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "Réservation",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			fd.deps,
		);
		return {
			recordingId,
			kill: fd.kill,
			close: fd.close,
			fireWindowClosed: fd.fireWindowClosed,
		};
	}

	it("crée le scénario depuis le YAML collé, rebase l'appId, stoppe Studio", async () => {
		const { recordingId, kill } = await start();
		const pasted =
			'appId: com.autre.enregistre\n---\n- launchApp\n- tapOn: "Réserver"\n';
		const scenario = await maestroRecorder.stopRecording(recordingId, pasted);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile).toBe(`${scenario.id}.flow.yaml`);
		expect(scenario.recordedStepCount).toBe(2);
		expect(kill).toHaveBeenCalledTimes(1);

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

	it("stop via presse-papier (sans pastedFlow) : scénario sauvé avec appId+--- et kill+close appelés", async () => {
		const fd = fakeDeps();
		const { recordingId, kill, close } = await start(fd);
		const clipboardFlow = "- tapOn:\n    id: x\n- tapOn: Y\n";
		const scenario = await maestroRecorder.stopRecording(
			recordingId,
			undefined,
			{ readClipboard: () => clipboardFlow },
		);
		expect(scenario.recordedStepCount).toBe(2);
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
		expect(spec).toContain("---");
		expect(kill).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("pastedFlow explicite a priorité sur le presse-papier", async () => {
		const fd = fakeDeps();
		const { recordingId } = await start(fd);
		const pastedFlow = "appId: com.autre\n---\n- launchApp\n- tapOn: Paste\n";
		const clipboardFlow = "- tapOn: Clipboard\n";
		const scenario = await maestroRecorder.stopRecording(
			recordingId,
			pastedFlow,
			{ readClipboard: () => clipboardFlow },
		);
		// Le contenu collé a 2 étapes (launchApp + tapOn: Paste), le clipboard a 1 étape
		expect(scenario.recordedStepCount).toBe(2);
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
		// L'appId doit être rebased vers com.ouigo.app (pas com.autre)
		expect(spec).toContain("appId: com.ouigo.app");
		expect(spec).toContain("tapOn: Paste");
		expect(spec).not.toContain("tapOn: Clipboard");
	});

	it("presse-papier vide et aucun paste → rejette /étape/i, kill+close NOT appelés, retry réussit", async () => {
		const fd = fakeDeps();
		const { recordingId, kill, close } = await start(fd);

		// Premier appel : presse-papier vide → erreur, session préservée
		await expect(
			maestroRecorder.stopRecording(recordingId, undefined, {
				readClipboard: () => "",
			}),
		).rejects.toThrow(/étape/i);
		expect(kill).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();

		// Retry avec presse-papier valide → succès
		const scenario = await maestroRecorder.stopRecording(
			recordingId,
			undefined,
			{ readClipboard: () => "- launchApp\n- tapOn: OK\n" },
		);
		expect(scenario.platform).toBe("mobile");
		expect(kill).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("YAML vide (pastedFlow) → erreur, kill NOT appelé, retry fonctionne", async () => {
		const { recordingId, kill } = await start();
		// Premier appel → erreur, kill pas appelé
		await expect(
			maestroRecorder.stopRecording(recordingId, "   ", {
				readClipboard: () => "",
			}),
		).rejects.toThrow(/étape/i);
		expect(kill).not.toHaveBeenCalled();

		// Retry avec YAML valide → succès
		const scenario = await maestroRecorder.stopRecording(
			recordingId,
			"appId: com.ouigo.app\n---\n- launchApp\n",
		);
		expect(scenario.platform).toBe("mobile");
		expect(kill).toHaveBeenCalledTimes(1);
	});

	it("YAML sans commande → erreur, kill NOT appelé, retry fonctionne", async () => {
		const { recordingId, kill } = await start();
		// Premier appel → erreur, kill pas appelé
		await expect(
			maestroRecorder.stopRecording(
				recordingId,
				"appId: com.x\n---\n# rien\n",
				{ readClipboard: () => "" },
			),
		).rejects.toThrow(/étape/i);
		expect(kill).not.toHaveBeenCalled();

		// Retry avec YAML valide → succès
		const scenario = await maestroRecorder.stopRecording(
			recordingId,
			"appId: com.ouigo.app\n---\n- launchApp\n",
		);
		expect(scenario.platform).toBe("mobile");
		expect(kill).toHaveBeenCalledTimes(1);
	});

	it("recordingId inconnu → erreur en français (introuvable)", async () => {
		await expect(
			maestroRecorder.stopRecording("nope", "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/introuvable/i);
	});

	it("fenêtre fermée par l'utilisateur → session annulée, stopRecording rejette /introuvable/i, kill+close déclenchés", async () => {
		const fd = fakeDeps();
		const { recordingId, kill, close, fireWindowClosed } = await start(fd);

		// L'utilisateur ferme la fenêtre Studio
		fireWindowClosed();

		// kill (process) + close (fenêtre) auraient dû être appelés via cancelRecording
		// cancelRecording appelle session.kill() qui appelle handle.kill() + win.close()
		expect(kill).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(1);

		// Un stopRecording ultérieur échoue avec introuvable
		await expect(
			maestroRecorder.stopRecording(recordingId, undefined, {
				readClipboard: () => "- launchApp\n",
			}),
		).rejects.toThrow(/introuvable/i);
	});

	it("#42 dédup : deux stop avec le même nom → ids distincts, les deux existent", async () => {
		// Premier enregistrement
		const { kill: kill1, deps: deps1 } = fakeDeps();
		const { recordingId: id1 } = await maestroRecorder.startRecording(
			{
				name: "Réservation",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps1,
		);
		const scenario1 = await maestroRecorder.stopRecording(
			id1,
			"appId: com.ouigo.app\n---\n- launchApp\n",
		);
		expect(kill1).toHaveBeenCalledTimes(1);

		// Deuxième enregistrement avec le même nom
		const { kill: kill2, deps: deps2 } = fakeDeps();
		const { recordingId: id2 } = await maestroRecorder.startRecording(
			{
				name: "Réservation",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps2,
		);
		const scenario2 = await maestroRecorder.stopRecording(
			id2,
			"appId: com.ouigo.app\n---\n- launchApp\n",
		);
		expect(kill2).toHaveBeenCalledTimes(1);

		// IDs distincts, second est suffixé
		expect(scenario1.id).toBe("reservation");
		expect(scenario2.id).toBe("reservation-2");

		// Les deux scénarios existent dans le store
		const saved1 = getScenario("p1", "general", scenario1.id);
		const saved2 = getScenario("p1", "general", scenario2.id);
		expect(saved1.name).toBe("Réservation");
		expect(saved2.name).toBe("Réservation");
	});
});

describe("maestroRecorder.cancelRecording", () => {
	it("stoppe Studio sans créer de scénario", async () => {
		const { kill, deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "X",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		maestroRecorder.cancelRecording(recordingId);
		expect(kill).toHaveBeenCalledTimes(1);
		// stop après cancel → recording introuvable
		await expect(
			maestroRecorder.stopRecording(
				recordingId,
				"appId: x\n---\n- launchApp\n",
			),
		).rejects.toThrow(/introuvable/i);
	});

	it("recordingId inconnu → no-op", () => {
		expect(() => maestroRecorder.cancelRecording("nope")).not.toThrow();
	});
});

describe("killAllRecordings", () => {
	it("tue tous les enregistrements actifs et vide la map", async () => {
		// Démarre deux enregistrements
		const { kill: kill1, deps: deps1 } = fakeDeps();
		const { recordingId: id1 } = await maestroRecorder.startRecording(
			{
				name: "Rec1",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps1,
		);

		const { kill: kill2, deps: deps2 } = fakeDeps();
		const { recordingId: id2 } = await maestroRecorder.startRecording(
			{
				name: "Rec2",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5556",
			},
			deps2,
		);

		// Appelle killAllRecordings
		killAllRecordings();

		// Les deux kills ont été appelés
		expect(kill1).toHaveBeenCalledTimes(1);
		expect(kill2).toHaveBeenCalledTimes(1);

		// La map est vide → stopRecording renvoie "introuvable"
		await expect(
			maestroRecorder.stopRecording(id1, "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/introuvable/i);
		await expect(
			maestroRecorder.stopRecording(id2, "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/introuvable/i);
	});
});

describe("studioSpawnInvocation", () => {
	const posixBin = "/usr/local/bin/maestro";
	const winBin =
		"C:\\Users\\First Last\\AppData\\Local\\maestro\\bin\\maestro.bat";
	const deviceId = "emulator-5554";
	const spacyDeviceId = "emulator 1";

	describe("POSIX (isWin=false)", () => {
		it("cmd est le bin brut (non cité)", () => {
			const inv = studioSpawnInvocation(posixBin, deviceId, false);
			expect(inv.cmd).toBe(posixBin);
		});

		it("args sont bruts (non cités)", () => {
			const inv = studioSpawnInvocation(posixBin, deviceId, false);
			expect(inv.args).toEqual(["--device", deviceId, "studio", "--no-window"]);
		});

		it("options.shell === false", () => {
			const inv = studioSpawnInvocation(posixBin, deviceId, false);
			expect(inv.options.shell).toBe(false);
		});

		it("options.stdio === 'ignore'", () => {
			const inv = studioSpawnInvocation(posixBin, deviceId, false);
			expect(inv.options.stdio).toBe("ignore");
		});

		it("options.detached === true", () => {
			const inv = studioSpawnInvocation(posixBin, deviceId, false);
			expect(inv.options.detached).toBe(true);
		});
	});

	describe("Windows (isWin=true)", () => {
		it("cmd est le bin cité (chemin avec espaces)", () => {
			const inv = studioSpawnInvocation(winBin, deviceId, true);
			expect(inv.cmd).toBe(`"${winBin}"`);
		});

		it("options.shell === true", () => {
			const inv = studioSpawnInvocation(winBin, deviceId, true);
			expect(inv.options.shell).toBe(true);
		});

		it("options.stdio === 'ignore'", () => {
			const inv = studioSpawnInvocation(winBin, deviceId, true);
			expect(inv.options.stdio).toBe("ignore");
		});

		it("options.detached === false", () => {
			const inv = studioSpawnInvocation(winBin, deviceId, true);
			expect(inv.options.detached).toBe(false);
		});

		it("deviceId sans espace n'est pas cité", () => {
			const inv = studioSpawnInvocation(winBin, deviceId, true);
			expect(inv.args).toContain(deviceId);
		});

		it("deviceId avec espace est cité", () => {
			const inv = studioSpawnInvocation(winBin, spacyDeviceId, true);
			expect(inv.args).toContain(`"${spacyDeviceId}"`);
		});

		it("les drapeaux --device/studio/--no-window restent non cités", () => {
			const inv = studioSpawnInvocation(winBin, spacyDeviceId, true);
			expect(inv.args).toContain("--device");
			expect(inv.args).toContain("studio");
			expect(inv.args).toContain("--no-window");
		});
	});
});
