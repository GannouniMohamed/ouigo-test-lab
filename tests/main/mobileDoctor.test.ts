import { homedir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	mobileDoctor,
	parseJavaMajor,
	parseMaestroVersion,
} from "../../src/main/mobile/doctor";
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

describe("parseMaestroVersion", () => {
	it("extrait le semver de la dernière ligne malgré la bannière analytics", () => {
		const out = [
			"Anonymous analytics enabled. To opt out, set MAESTRO_CLI_NO_ANALYTICS ...",
			"||| Try out our new Analyze with AI feature. ||| See what's new: ...",
			"2.6.1",
		].join("\n");
		expect(parseMaestroVersion(out)).toBe("2.6.1");
	});

	it("retombe sur le premier semver trouvé si pas de ligne nue", () => {
		expect(parseMaestroVersion("Maestro version 1.39.0 installed")).toBe(
			"1.39.0",
		);
	});

	it("renvoie undefined si aucune version", () => {
		expect(parseMaestroVersion("rien d'utile")).toBeUndefined();
	});
});

// Routeur de stub : renvoie une sortie canned selon le binaire appelé. On
// matche aussi sur le basename pour que maestroBin() résolu en chemin absolu
// (~/.maestro/bin/maestro) retrouve l'entrée « maestro ».
function router(map: Record<string, ExecResult>) {
	return async (bin: string): Promise<ExecResult> =>
		map[bin] ??
		map[basename(bin)] ?? { code: -1, stdout: "", stderr: "not found" };
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

	it("appareil présent mais offline → device.ok=false, allOk=false", async () => {
		const report = await mobileDoctor({
			run: router({
				java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.1"' },
				maestro: { code: 0, stdout: "1.39.0", stderr: "" },
				adb: {
					code: 0,
					stdout: "List of devices attached\nABCD1234 unauthorized\n",
					stderr: "",
				},
			}),
			exists: () => true,
		});
		expect(report.device.ok).toBe(false);
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

	it("résout maestro depuis ~/.maestro/bin quand présent (post-install)", async () => {
		const localMaestro = join(homedir(), ".maestro", "bin", "maestro");
		const calls: string[] = [];
		const run = async (bin: string): Promise<ExecResult> => {
			calls.push(bin);
			if (bin === localMaestro)
				return { code: 0, stdout: "1.39.0", stderr: "" };
			if (bin === "java")
				return { code: 0, stdout: "", stderr: 'openjdk version "17.0.8"' };
			if (bin === "adb")
				return {
					code: 0,
					stdout: "List of devices attached\nemulator-5554 device\n",
					stderr: "",
				};
			return { code: -1, stdout: "", stderr: "not found" };
		};
		// exists vrai UNIQUEMENT pour le binaire maestro local (pas Studio).
		const report = await mobileDoctor({
			run,
			exists: (p) => p === localMaestro,
		});
		expect(calls).toContain(localMaestro);
		expect(report.maestro.ok).toBe(true);
	});
});
