import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureManagedMaestro,
	isManagedMaestroReady,
	managedMaestroBin,
	managedMaestroDir,
} from "../../src/main/mobile/managedMaestro";

let dir: string;
const isWindows = process.platform === "win32";
function binPath(ws: string): string {
	return join(
		ws,
		"tools",
		"maestro-2.5.1",
		"maestro",
		"bin",
		isWindows ? "maestro.bat" : "maestro",
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mm-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_MAESTRO_BIN"])
		Reflect.deleteProperty(process.env, k);
});

describe("managedMaestroBin / isManagedMaestroReady", () => {
	it("undefined / false quand le binaire est absent", () => {
		expect(managedMaestroBin(() => false)).toBeUndefined();
		expect(isManagedMaestroReady(() => false)).toBe(false);
	});
	it("renvoie le chemin attendu quand il existe", () => {
		const expected = binPath(dir);
		expect(managedMaestroBin((p) => p === expected)).toBe(expected);
		expect(isManagedMaestroReady((p) => p === expected)).toBe(true);
	});
});

describe("ensureManagedMaestro", () => {
	it("OTL_MAESTRO_BIN court-circuite tout (pas de téléchargement)", async () => {
		process.env.OTL_MAESTRO_BIN = "/opt/x/maestro";
		const download = vi.fn();
		const res = await ensureManagedMaestro({ download });
		expect(res.bin).toBe("/opt/x/maestro");
		expect(download).not.toHaveBeenCalled();
	});

	it("binaire déjà présent → pas de téléchargement", async () => {
		const expected = binPath(dir);
		const download = vi.fn();
		const res = await ensureManagedMaestro({
			exists: (p) => p === expected,
			download,
		});
		expect(res.bin).toBe(expected);
		expect(download).not.toHaveBeenCalled();
	});

	it("absent → download puis unzip puis chmod, dans cet ordre", async () => {
		let extracted = false;
		const calls: string[] = [];
		const expected = binPath(dir);
		const download = vi.fn(async () => {
			calls.push("download");
		});
		const unzip = vi.fn(async () => {
			calls.push("unzip");
			extracted = true;
		});
		const chmod = vi.fn(() => {
			calls.push("chmod");
		});
		const res = await ensureManagedMaestro({
			exists: (p) => extracted && p === expected,
			download,
			unzip,
			chmod,
		});
		expect(res.bin).toBe(expected);
		expect(download).toHaveBeenCalledWith(
			expect.stringContaining("cli-2.5.1"),
			join(managedMaestroDir(), "maestro.zip"),
			undefined,
		);
		expect(unzip).toHaveBeenCalledWith(
			join(managedMaestroDir(), "maestro.zip"),
			managedMaestroDir(),
		);
		expect(calls.slice(0, 2)).toEqual(["download", "unzip"]);
	});

	it("transmet onProgress au téléchargement", async () => {
		let extracted = false;
		const expected = binPath(dir);
		const onProgress = vi.fn();
		const download = vi.fn(
			async (
				_url: string,
				_dest: string,
				cb?: (r: number, t: number) => void,
			) => {
				cb?.(50, 100);
			},
		);
		await ensureManagedMaestro({
			exists: (p) => extracted && p === expected,
			download,
			unzip: async () => {
				extracted = true;
			},
			chmod: () => {},
			onProgress,
		});
		expect(onProgress).toHaveBeenCalledWith(50, 100);
	});
});
