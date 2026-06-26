import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runTool, toolBin } from "../../src/main/mobile/exec";

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
