import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

// Routeur de stub : renvoie une sortie canned selon le binaire appelé.
function router(map: Record<string, ExecResult>) {
	return async (bin: string): Promise<ExecResult> =>
		map[bin] ??
		map[basename(bin)] ?? { code: -1, stdout: "", stderr: "not found" };
}

let tmpWs: string;

describe("mobileDoctor", () => {
	beforeEach(() => {
		tmpWs = mkdtempSync(join(tmpdir(), "oui-test-ws-"));
		process.env.OTL_WORKSPACE = tmpWs;
	});

	afterEach(() => {
		process.env.OTL_WORKSPACE = undefined;
		rmSync(tmpWs, { recursive: true, force: true });
	});

	it("tout vert quand java17+/maestro/adb/appareil sont présents", async () => {
		const run = router({
			java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.8"' },
			adb: {
				code: 0,
				stdout:
					"List of devices attached\nemulator-5554 device model:Pixel_6\n",
				stderr: "",
			},
		});
		const report = await mobileDoctor({
			run,
			exists: (p) => p.includes("maestro-2.5.1"),
		});
		expect(report.java.ok).toBe(true);
		expect(report.java.version).toBe("17");
		expect(report.maestro.ok).toBe(true);
		expect(report.maestro.version).toBe("2.5.1");
		expect(report.adb.ok).toBe(true);
		expect(report.device.ok).toBe(true);
		expect(report.allOk).toBe(true);
	});

	it("java < 17 → java.ok=false avec un hint, allOk=false", async () => {
		const run = router({
			java: { code: 0, stdout: "", stderr: 'java version "1.8.0_381"' },
			adb: { code: 0, stdout: "List of devices attached\n", stderr: "" },
		});
		const report = await mobileDoctor({
			run,
			exists: (p) => p.includes("maestro-2.5.1"),
		});
		expect(report.java.ok).toBe(false);
		expect(report.java.hint).toBeTruthy();
		expect(report.allOk).toBe(false);
	});

	it("appareil présent mais offline → device.ok=false, allOk=false", async () => {
		const run = router({
			java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.1"' },
			adb: {
				code: 0,
				stdout: "List of devices attached\nABCD1234 unauthorized\n",
				stderr: "",
			},
		});
		const report = await mobileDoctor({
			run,
			exists: (p) => p.includes("maestro-2.5.1"),
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
		expect(report.maestro.hint).toBeTruthy();
		expect(report.adb.ok).toBe(false);
		expect(report.device.ok).toBe(false);
		expect(report.allOk).toBe(false);
	});

	it("maestro absent (exists retourne false) → maestro.ok=false, allOk=false", async () => {
		const run = router({
			java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.8"' },
			adb: {
				code: 0,
				stdout:
					"List of devices attached\nemulator-5554 device model:Pixel_6\n",
				stderr: "",
			},
		});
		const report = await mobileDoctor({ run, exists: () => false });
		expect(report.maestro.ok).toBe(false);
		expect(report.allOk).toBe(false);
	});
});
