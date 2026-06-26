import { describe, expect, it } from "vitest";
import { runTool, toolBin } from "../../src/main/mobile/exec";

describe("runTool", () => {
	it("capture stdout et code 0 (commande node cross-platform)", async () => {
		const r = await runTool(process.execPath, [
			"-e",
			"process.stdout.write('hello')",
		]);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("hello");
	});

	it("capture stderr et un code non nul", async () => {
		const r = await runTool(process.execPath, [
			"-e",
			"process.stderr.write('boom'); process.exit(3)",
		]);
		expect(r.code).toBe(3);
		expect(r.stderr).toContain("boom");
	});

	it("ne rejette pas si le binaire est introuvable (code -1)", async () => {
		const r = await runTool("otl-binaire-inexistant-xyz", ["--version"]);
		expect(r.code).toBe(-1);
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
