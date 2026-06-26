import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleInstallApp,
	handleInstallMaestro,
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

	it("handleInstallMaestro délègue à installMaestroCli (seam → succès)", async () => {
		process.env.OTL_MAESTRO_INSTALL_CMD = "true"; // commande qui réussit
		const res = await handleInstallMaestro();
		expect(res.ok).toBe(true);
	});
});

afterEach(() => Reflect.deleteProperty(process.env, "OTL_MAESTRO_INSTALL_CMD"));

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
