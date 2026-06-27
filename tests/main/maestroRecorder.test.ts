import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

// Dépendances injectées : Studio « lancé » sans process réel.
function fakeDeps() {
	const kill = vi.fn();
	return {
		kill,
		deps: {
			ensureMaestro: vi.fn(async () => ({ bin: "/fake/maestro" })),
			spawnStudio: vi.fn(() => ({ pid: 4242, kill })),
			waitForPort: vi.fn(async () => {}),
			openExternal: vi.fn(),
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
	it("lance Studio web (ensure + spawn + attente port + ouverture navigateur)", async () => {
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
		expect(deps.openExternal).toHaveBeenCalledWith("http://localhost:9999");
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
});

describe("maestroRecorder.stopRecording", () => {
	async function start() {
		const { kill, deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "Réservation",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		return { recordingId, kill };
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

	it("YAML vide → erreur, pas de scénario", async () => {
		const { recordingId } = await start();
		await expect(
			maestroRecorder.stopRecording(recordingId, "   "),
		).rejects.toThrow(/étape/i);
	});

	it("YAML sans commande → erreur", async () => {
		const { recordingId } = await start();
		await expect(
			maestroRecorder.stopRecording(recordingId, "appId: com.x\n---\n# rien\n"),
		).rejects.toThrow(/étape/i);
	});

	it("recordingId inconnu → erreur", async () => {
		await expect(
			maestroRecorder.stopRecording("nope", "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/not found/i);
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
		).rejects.toThrow(/not found/i);
	});

	it("recordingId inconnu → no-op", () => {
		expect(() => maestroRecorder.cancelRecording("nope")).not.toThrow();
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
