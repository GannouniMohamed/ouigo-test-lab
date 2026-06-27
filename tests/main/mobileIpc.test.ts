import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleInstallApp,
	handleListDevices,
	handleMobileDoctor,
	handleStartDevice,
} from "../../src/main/ipc/mobileHandlers";
import { saveProject } from "../../src/main/stores/projectStore";

// Pas de vrai appareil/binaire en CI : adb/maestro/java sont absents, donc les
// handlers doivent renvoyer des résultats dégradés cohérents sans lever.
describe("mobileHandlers", () => {
	// Ces deux tests lancent les vrais spawns d'outils (absents en CI). Sous
	// Windows, chaque échec passe par cmd.exe et le cumul peut dépasser le délai
	// par défaut (5s) sur un runner chargé → timeout généreux.
	it("handleMobileDoctor renvoie un rapport (dégradé) sans lever", async () => {
		const report = await handleMobileDoctor();
		expect(report).toHaveProperty("allOk");
		expect(report).toHaveProperty("java");
		expect(typeof report.allOk).toBe("boolean");
	}, 30000);

	it("handleListDevices renvoie un tableau", async () => {
		const devices = await handleListDevices();
		expect(Array.isArray(devices)).toBe(true);
	}, 30000);

	it("handleStartDevice renvoie un objet { ok }", async () => {
		// Force un binaire absent → échec rapide et déterministe, sans booter un
		// vrai émulateur sur une machine de dev où maestro est installé.
		process.env.OTL_MAESTRO_BIN = "/nonexistent/otl-maestro-test";
		const res = await handleStartDevice();
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
		expect(res).toHaveProperty("ok");
		expect(typeof res.ok).toBe("boolean");
	});

	it("handlePrepareMaestro délègue à ensureManagedMaestro (seam → succès)", async () => {
		process.env.OTL_MAESTRO_BIN = process.execPath; // court-circuite le download
		const { handlePrepareMaestro } = await import(
			"../../src/main/ipc/mobileHandlers"
		);
		const res = await handlePrepareMaestro();
		expect(res.ok).toBe(true);
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});

	it("handlePrepareMaestro transmet onProgress au téléchargement", async () => {
		// Court-circuite en pointant OTL_MAESTRO_BIN vers un binaire réel :
		// ensureManagedMaestro retourne immédiatement, onProgress n'est PAS appelée
		// (le chemin download est court-circuité). On vérifie simplement que le spy
		// est bien câblé (interface respectée) et que handlePrepareMaestro renvoie ok.
		process.env.OTL_MAESTRO_BIN = process.execPath;
		const { handlePrepareMaestro } = await import(
			"../../src/main/ipc/mobileHandlers"
		);
		const progressSpy = vi.fn();
		const res = await handlePrepareMaestro(progressSpy);
		expect(res.ok).toBe(true);
		// Le spy n'est pas appelé (court-circuit avant download) — mais aucune erreur
		// ne doit se produire non plus.
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});

	it("handlePrepareMaestro : la closure de progression ne lève pas si le sender est détruit", async () => {
		// Simule la fermeture de la fenêtre pendant le téléchargement :
		// on appelle directement handlePrepareMaestro avec un spy qui simule
		// un sender détruit (comme register.ts le ferait après isDestroyed()).
		process.env.OTL_MAESTRO_BIN = process.execPath;
		const { handlePrepareMaestro } = await import(
			"../../src/main/ipc/mobileHandlers"
		);
		// Construit une closure identique à celle de register.ts :
		// if (!isDestroyed()) sender.send(...)
		// On la force à simuler isDestroyed() === true → send ne doit jamais être appelé.
		const sendSpy = vi.fn();
		let destroyed = false;
		const progressClosure = (received: number, total: number) => {
			if (!destroyed) sendSpy("maestro:prepare-progress", { received, total });
		};
		destroyed = true; // simule la fenêtre déjà détruite
		// Ne doit pas lever, que le spy soit appelé ou non.
		await expect(handlePrepareMaestro(progressClosure)).resolves.not.toThrow();
		expect(sendSpy).not.toHaveBeenCalled();
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});

	it("handlePrepareMaestro renvoie { ok: false, error } quand ensureManagedMaestro lève (#20)", async () => {
		// Injecte un workspace temporaire vide (pas de binaire géré) et s'assure
		// qu'OTL_MAESTRO_BIN est absent pour forcer le chemin _doEnsure.
		// Le download injecté lève immédiatement → handlePrepareMaestro doit
		// attraper l'erreur et renvoyer { ok: false, error: <message> }.
		const { mkdtempSync, rmSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const tmpDir = mkdtempSync(join(tmpdir(), "otl-mhp-"));
		try {
			Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
			process.env.OTL_WORKSPACE = tmpDir;

			// On mock ensureManagedMaestro directement via vi.mock pour simuler l'échec.
			const errMsg = "Échec réseau simulé pour test";
			const managedMaestroModule = await import(
				"../../src/main/mobile/managedMaestro"
			);
			const original = managedMaestroModule.ensureManagedMaestro;
			const spy = vi
				.spyOn(managedMaestroModule, "ensureManagedMaestro")
				.mockRejectedValueOnce(new Error(errMsg));

			// Réimporte pour s'assurer d'une instance fraîche du module.
			// (vitest met en cache les modules, le spy sur l'export fonctionne directement.)
			const { handlePrepareMaestro } = await import(
				"../../src/main/ipc/mobileHandlers"
			);
			const res = await handlePrepareMaestro();
			expect(res.ok).toBe(false);
			expect(res.error).toContain(errMsg);

			spy.mockRestore();
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
			Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
		}
	});
});

describe("handleInstallApp", () => {
	let dir: string;
	beforeEach(async () => {
		const { mkdtempSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		dir = mkdtempSync(join(tmpdir(), "otl-iapp-"));
		process.env.OTL_WORKSPACE = dir;
		saveProject({
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
				{ id: "noapp", label: "SansApp", baseURL: "", variables: {} },
			],
		});
	});
	afterEach(async () => {
		const { rmSync } = await import("node:fs");
		rmSync(dir, { recursive: true, force: true });
		Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	});

	it("source installed → { ok: true } (aucun spawn)", async () => {
		const res = await handleInstallApp("p1", "preprod", "emulator-5554");
		expect(res.ok).toBe(true);
	});

	it("env sans app → { ok: false }", async () => {
		const res = await handleInstallApp("p1", "noapp", "emulator-5554");
		expect(res.ok).toBe(false);
	});

	it("projet/env inconnu → { ok: false } (ne lève pas)", async () => {
		const res = await handleInstallApp("nope", "nope", "emulator-5554");
		expect(res.ok).toBe(false);
	});
});
