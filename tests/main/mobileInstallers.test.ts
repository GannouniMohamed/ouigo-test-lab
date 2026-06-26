import { afterEach, describe, expect, it, vi } from "vitest";
import { installMaestroCli } from "../../src/main/mobile/installers";

afterEach(() => Reflect.deleteProperty(process.env, "OTL_MAESTRO_INSTALL_CMD"));

describe("installMaestroCli", () => {
	it("exécute sh -c <commande d'install> et réussit sur code 0", async () => {
		const calls: Array<{ bin: string; args: string[] }> = [];
		const run = vi.fn(async (bin: string, args: string[]) => {
			calls.push({ bin, args });
			return { code: 0, stdout: "Maestro installed", stderr: "" };
		});
		const res = await installMaestroCli(run);
		expect(res).toEqual({ ok: true });
		expect(calls[0].bin).toBe("sh");
		expect(calls[0].args[0]).toBe("-c");
		expect(calls[0].args[1]).toContain("get.maestro.mobile.dev");
	});

	it("échoue avec l'erreur sur code non nul", async () => {
		const run = vi.fn(async () => ({
			code: 1,
			stdout: "",
			stderr: "curl: (6) could not resolve host",
		}));
		const res = await installMaestroCli(run);
		expect(res.ok).toBe(false);
		expect(res.error).toContain("could not resolve host");
	});

	it("honore le seam OTL_MAESTRO_INSTALL_CMD (tests hermétiques)", async () => {
		process.env.OTL_MAESTRO_INSTALL_CMD = "true";
		const run = vi.fn(async (_bin: string, args: string[]) => ({
			code: 0,
			stdout: args[1],
			stderr: "",
		}));
		await installMaestroCli(run);
		expect(run.mock.calls[0][1][1]).toBe("true");
	});
});
