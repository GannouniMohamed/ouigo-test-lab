import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	maestroBin,
	quoteArgForCmd,
	quoteForCmd,
	runTool,
	toolBin,
} from "../../src/main/mobile/exec";

// Fixtures shell-safe (chemins sans espaces) → fiables même sous cmd.exe (Windows).
const EXIT_STDERR_FIXTURE = resolve(
	process.cwd(),
	"tests/fixtures/exit-with-stderr.mjs",
);

describe("runTool", () => {
	it("capture stdout et code 0 (node --version, cross-platform)", async () => {
		const r = await runTool(process.execPath, ["--version"]);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("v");
	});

	it("propage le code de sortie et capture stderr", async () => {
		const r = await runTool(process.execPath, [EXIT_STDERR_FIXTURE]);
		expect(r.code).toBe(3);
		expect(r.stderr).toContain("boom");
	});

	it("ne rejette pas si le binaire est introuvable (code d'échec)", async () => {
		const r = await runTool("otl-binaire-inexistant-xyz", ["--version"]);
		// -1 (erreur de spawn sur *nix) ou code shell non nul (Windows/cmd).
		expect(r.code).not.toBe(0);
		expect(r.stderr.length).toBeGreaterThan(0);
	});
});

describe("quoteForCmd", () => {
	it("entoure de guillemets (chemin avec espaces)", () => {
		expect(quoteForCmd("C:\\Users\\John Doe\\app.apk")).toBe(
			'"C:\\Users\\John Doe\\app.apk"',
		);
	});
	it("échappe les guillemets internes", () => {
		expect(quoteForCmd('a"b')).toBe('"a\\"b"');
	});
});

describe("quoteArgForCmd", () => {
	it("ne cite PAS un argument sans espace (ex. -version)", () => {
		expect(quoteArgForCmd("-version")).toBe("-version");
		expect(quoteArgForCmd("devices")).toBe("devices");
	});
	it("cite un argument contenant une espace (ex. chemin d'APK)", () => {
		expect(quoteArgForCmd("C:\\Users\\John Doe\\app.apk")).toBe(
			'"C:\\Users\\John Doe\\app.apk"',
		);
	});
});

describe("toolBin", () => {
	it("renvoie le nom par défaut", () => {
		Reflect.deleteProperty(process.env, "OTL_ADB_BIN");
		expect(toolBin("adb")).toBe("adb");
	});

	it("honore l'override d'env OTL_<NAME>_BIN", () => {
		process.env.OTL_MAESTRO_BIN = "/opt/maestro/bin/maestro";
		expect(toolBin("maestro")).toBe("/opt/maestro/bin/maestro");
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});
});

describe("maestroBin", () => {
	afterEach(() => Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN"));

	it("préfère OTL_MAESTRO_BIN s'il est défini", () => {
		process.env.OTL_MAESTRO_BIN = "/custom/maestro";
		expect(maestroBin(() => true)).toBe("/custom/maestro");
	});

	it("retombe sur ~/.maestro/bin/maestro s'il existe", () => {
		const expected = join(homedir(), ".maestro", "bin", "maestro");
		expect(maestroBin((p) => p === expected)).toBe(expected);
	});

	it("retombe sur « maestro » (PATH) si rien d'autre", () => {
		expect(maestroBin(() => false)).toBe("maestro");
	});
});

describe("maestroBin — binaire géré par l'app", () => {
	afterEach(() => {
		Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});

	it("préfère le binaire géré au PATH quand il existe", () => {
		const ws = mkdtempSync(join(tmpdir(), "otl-mbin-"));
		process.env.OTL_WORKSPACE = ws;
		const managed = join(
			ws,
			"tools",
			"maestro-2.5.1",
			"maestro",
			"bin",
			process.platform === "win32" ? "maestro.bat" : "maestro",
		);
		expect(maestroBin((p) => p === managed)).toBe(managed);
	});

	it("OTL_MAESTRO_BIN reste prioritaire sur le binaire géré", () => {
		process.env.OTL_WORKSPACE = mkdtempSync(join(tmpdir(), "otl-mbin-"));
		process.env.OTL_MAESTRO_BIN = "/custom/maestro";
		expect(maestroBin(() => true)).toBe("/custom/maestro");
	});
});
