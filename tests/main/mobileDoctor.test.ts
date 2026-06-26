import { describe, expect, it } from "vitest";
import { mobileDoctor, parseJavaMajor } from "../../src/main/mobile/doctor";
import type { ExecResult } from "../../src/main/mobile/exec";

describe("parseJavaMajor", () => {
	it("extrait 17 d'un openjdk 17.x", () => {
		expect(parseJavaMajor('openjdk version "17.0.8" 2023-07-18')).toBe(17);
	});
	it("extrait 8 du schéma legacy 1.8.0", () => {
		expect(parseJavaMajor('java version "1.8.0_381"')).toBe(8);
	});
	it("renvoie null si illisible", () => {
		expect(parseJavaMajor("commande introuvable")).toBeNull();
	});
});

// Routeur de stub : renvoie une sortie canned selon le binaire appelé.
function router(map: Record<string, ExecResult>) {
	return async (bin: string): Promise<ExecResult> =>
		map[bin] ?? { code: -1, stdout: "", stderr: "not found" };
}

describe("mobileDoctor", () => {
	it("tout vert quand java17+/maestro/adb/studio/appareil sont présents", async () => {
		const report = await mobileDoctor({
			run: router({
				java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.8"' },
				maestro: { code: 0, stdout: "1.39.0", stderr: "" },
				adb: {
					code: 0,
					stdout:
						"List of devices attached\nemulator-5554 device model:Pixel_6\n",
					stderr: "",
				},
			}),
			exists: () => true,
		});
		expect(report.java.ok).toBe(true);
		expect(report.java.version).toBe("17");
		expect(report.maestro.ok).toBe(true);
		expect(report.adb.ok).toBe(true);
		expect(report.studio.ok).toBe(true);
		expect(report.device.ok).toBe(true);
		expect(report.allOk).toBe(true);
	});

	it("java < 17 → java.ok=false avec un hint, allOk=false", async () => {
		const report = await mobileDoctor({
			run: router({
				java: { code: 0, stdout: "", stderr: 'java version "1.8.0_381"' },
				maestro: { code: 0, stdout: "1.39.0", stderr: "" },
				adb: { code: 0, stdout: "List of devices attached\n", stderr: "" },
			}),
			exists: () => true,
		});
		expect(report.java.ok).toBe(false);
		expect(report.java.hint).toBeTruthy();
		expect(report.allOk).toBe(false);
	});

	it("binaires absents → checks ko avec hints, device ko", async () => {
		const report = await mobileDoctor({
			run: router({}), // tout renvoie code -1
			exists: () => false,
		});
		expect(report.maestro.ok).toBe(false);
		expect(report.maestro.hint).toContain("maestro");
		expect(report.adb.ok).toBe(false);
		expect(report.studio.ok).toBe(false);
		expect(report.device.ok).toBe(false);
		expect(report.allOk).toBe(false);
	});
});
