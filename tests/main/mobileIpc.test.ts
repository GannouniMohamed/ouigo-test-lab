import { afterEach, describe, expect, it } from "vitest";
import {
	handleInstallMaestro,
	handleListDevices,
	handleMobileDoctor,
	handleStartDevice,
} from "../../src/main/ipc/mobileHandlers";

// Pas de vrai appareil/binaire en CI : adb/maestro/java sont absents, donc les
// handlers doivent renvoyer des résultats dégradés cohérents sans lever.
describe("mobileHandlers", () => {
	it("handleMobileDoctor renvoie un rapport (dégradé) sans lever", async () => {
		const report = await handleMobileDoctor();
		expect(report).toHaveProperty("allOk");
		expect(report).toHaveProperty("java");
		expect(typeof report.allOk).toBe("boolean");
	});

	it("handleListDevices renvoie un tableau", async () => {
		const devices = await handleListDevices();
		expect(Array.isArray(devices)).toBe(true);
	});

	it("handleStartDevice renvoie un objet { ok }", async () => {
		const res = await handleStartDevice();
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
