import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
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
function sentinelPath(ws: string): string {
	return join(ws, "tools", "maestro-2.5.1", ".maestro-ok");
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
		const sentinel = sentinelPath(dir);
		expect(managedMaestroBin((p) => p === expected || p === sentinel)).toBe(
			expected,
		);
		expect(isManagedMaestroReady((p) => p === expected || p === sentinel)).toBe(
			true,
		);
	});
	it("renvoie undefined si le binaire est présent mais le sentinel est absent", () => {
		const expected = binPath(dir);
		// bin exists but sentinel does not
		expect(managedMaestroBin((p) => p === expected)).toBeUndefined();
		expect(isManagedMaestroReady((p) => p === expected)).toBe(false);
	});
	it("renvoie undefined si le sentinel est présent mais le binaire est absent", () => {
		const sentinel = sentinelPath(dir);
		expect(managedMaestroBin((p) => p === sentinel)).toBeUndefined();
		expect(isManagedMaestroReady((p) => p === sentinel)).toBe(false);
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
		const sentinel = sentinelPath(dir);
		const download = vi.fn();
		const res = await ensureManagedMaestro({
			exists: (p) => p === expected || p === sentinel,
			download,
		});
		expect(res.bin).toBe(expected);
		expect(download).not.toHaveBeenCalled();
	});

	it("absent → download puis unzip puis chmod, dans cet ordre", async () => {
		let extracted = false;
		const calls: string[] = [];
		const expected = binPath(dir);
		const sentinel = sentinelPath(dir);
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
			exists: (p) => extracted && (p === expected || p === sentinel),
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
		const sentinel = sentinelPath(dir);
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
			exists: (p) => extracted && (p === expected || p === sentinel),
			download,
			unzip: async () => {
				extracted = true;
			},
			chmod: () => {},
			onProgress,
		});
		expect(onProgress).toHaveBeenCalledWith(50, 100);
	});

	// ─── Sentinel tests ───────────────────────────────────────────────────────

	it("happy path: écrit le sentinel .maestro-ok et isManagedMaestroReady est true", async () => {
		// Use a real filesystem so we can verify the sentinel was actually written
		const toolsDir = join(dir, "tools", "maestro-2.5.1");
		mkdirSync(toolsDir, { recursive: true });
		const binDir = join(toolsDir, "maestro", "bin");
		mkdirSync(binDir, { recursive: true });
		const binFile = join(binDir, isWindows ? "maestro.bat" : "maestro");
		writeFileSync(binFile, "#!/bin/sh\nexec maestro $@\n");
		const sentinel = join(toolsDir, ".maestro-ok");

		// We'll use a real exists check (both files will be written)
		const download = vi.fn(async () => {});
		const unzip = vi.fn(async () => {
			// Simulate extraction already done above
		});
		const chmod = vi.fn();

		await ensureManagedMaestro({
			download,
			unzip,
			chmod,
			// no custom exists → uses existsSync
		});

		// The sentinel should exist on disk
		const { existsSync } = await import("node:fs");
		expect(existsSync(sentinel)).toBe(true);
		expect(isManagedMaestroReady()).toBe(true);
	});

	it("supprimer le sentinel → isManagedMaestroReady false même si le binaire reste", async () => {
		const toolsDir = join(dir, "tools", "maestro-2.5.1");
		mkdirSync(toolsDir, { recursive: true });
		const binDir = join(toolsDir, "maestro", "bin");
		mkdirSync(binDir, { recursive: true });
		const binFile = join(binDir, isWindows ? "maestro.bat" : "maestro");
		writeFileSync(binFile, "#!/bin/sh\nexec maestro $@\n");
		const sentinel = join(toolsDir, ".maestro-ok");

		await ensureManagedMaestro({
			download: vi.fn(async () => {}),
			unzip: vi.fn(async () => {}),
			chmod: vi.fn(),
		});

		const { existsSync } = await import("node:fs");
		expect(existsSync(sentinel)).toBe(true);
		expect(isManagedMaestroReady()).toBe(true);

		// Delete only the sentinel — bin still exists
		rmSync(sentinel);
		expect(isManagedMaestroReady()).toBe(false);
	});

	// ─── Failure path tests ───────────────────────────────────────────────────

	it("download throws → ensureManagedMaestro rejette", async () => {
		const downloadErr = new Error("Réseau indisponible");
		await expect(
			ensureManagedMaestro({
				exists: () => false,
				download: async () => {
					throw downloadErr;
				},
				unzip: vi.fn(),
				chmod: vi.fn(),
			}),
		).rejects.toThrow("Réseau indisponible");
	});

	it("unzip throws → ensureManagedMaestro rejette", async () => {
		const unzipErr = new Error("Archive corrompue");
		await expect(
			ensureManagedMaestro({
				exists: () => false,
				download: vi.fn(async () => {}),
				unzip: async () => {
					throw unzipErr;
				},
				chmod: vi.fn(),
			}),
		).rejects.toThrow("Archive corrompue");
	});

	it("binaire absent après unzip → rejette avec 'binaire introuvable'", async () => {
		// unzip succeeds but bin still does not exist
		await expect(
			ensureManagedMaestro({
				exists: () => false,
				download: vi.fn(async () => {}),
				unzip: vi.fn(async () => {}),
				chmod: vi.fn(),
			}),
		).rejects.toThrow(/binaire introuvable/i);
	});

	it("failure cleanup: échec unzip → zip + dossier maestro/ supprimés", async () => {
		// Use a real dir so we can check filesystem state
		const toolsDir = join(dir, "tools", "maestro-2.5.1");
		mkdirSync(toolsDir, { recursive: true });

		// Simulate: download writes the zip; unzip fails
		const zipPath = join(toolsDir, "maestro.zip");
		const maestroSubDir = join(toolsDir, "maestro");

		let downloadCalled = 0;
		const download = vi.fn(async () => {
			downloadCalled++;
			// Simulate creating the zip on disk
			writeFileSync(zipPath, "fake zip content");
		});
		let unzipCallCount = 0;
		const unzip = vi.fn(async () => {
			unzipCallCount++;
			if (unzipCallCount === 1) {
				// Partial extraction — create the subdir but fail
				mkdirSync(maestroSubDir, { recursive: true });
				throw new Error("Archive corrompue");
			}
			// Second call succeeds (no need to create files, exists will match)
		});
		const chmod = vi.fn();

		// First call — should fail and clean up
		await expect(
			ensureManagedMaestro({
				exists: () => false,
				download,
				unzip,
				chmod,
			}),
		).rejects.toThrow("Archive corrompue");

		const { existsSync } = await import("node:fs");
		// Both zip and maestro/ subdir should be cleaned up
		expect(existsSync(zipPath)).toBe(false);
		expect(existsSync(maestroSubDir)).toBe(false);

		// Second call should re-download (download called twice)
		let extracted2 = false;
		const binFile = binPath(dir);
		const sentinel = sentinelPath(dir);
		const download2 = vi.fn(async () => {});
		const unzip2 = vi.fn(async () => {
			extracted2 = true;
		});
		await ensureManagedMaestro({
			exists: (p) => extracted2 && (p === binFile || p === sentinel),
			download: download2,
			unzip: unzip2,
			chmod,
		});
		expect(download2).toHaveBeenCalledTimes(1);
	});

	// ─── Concurrency test ─────────────────────────────────────────────────────

	it("appels concurrents → download appelé une seule fois", async () => {
		// We need to reset inflight between tests. Since it's module-level,
		// it should start as undefined at start of each call chain.
		let resolveDownload!: () => void;
		const downloadPromise = new Promise<void>((res) => {
			resolveDownload = res;
		});
		let extracted = false;
		const expected = binPath(dir);
		const sentinel = sentinelPath(dir);
		const download = vi.fn(async () => {
			await downloadPromise;
		});
		const unzip = vi.fn(async () => {
			extracted = true;
		});
		const chmod = vi.fn();
		const existsFn = (p: string) =>
			extracted && (p === expected || p === sentinel);

		// Start two concurrent calls
		const p1 = ensureManagedMaestro({
			exists: existsFn,
			download,
			unzip,
			chmod,
		});
		const p2 = ensureManagedMaestro({
			exists: existsFn,
			download,
			unzip,
			chmod,
		});

		// Resolve download
		resolveDownload();

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(download).toHaveBeenCalledTimes(1);
		expect(r1.bin).toBe(expected);
		expect(r2.bin).toBe(expected);
	});
});

// ─── realDownload byte-integrity test ─────────────────────────────────────────

describe("realDownload byte integrity", () => {
	afterEach(() => {
		// Restore original fetch if we replaced it
		if ((globalThis as { _origFetch?: typeof fetch })._origFetch) {
			globalThis.fetch = (globalThis as { _origFetch?: typeof fetch })
				._origFetch as typeof fetch;
			(globalThis as { _origFetch?: typeof fetch })._origFetch = undefined;
		}
	});

	it("écrit exactement les octets reçus et onProgress reçoit le bon total", async () => {
		// Build known chunks totalling >64KB
		const CHUNK_SIZE = 20_000;
		const CHUNK_COUNT = 4; // 80KB total
		const chunks: Buffer[] = Array.from({ length: CHUNK_COUNT }, (_, i) =>
			Buffer.alloc(CHUNK_SIZE, i + 1),
		);
		const expectedBytes = Buffer.concat(chunks);
		const totalSize = expectedBytes.length;

		// Build a web ReadableStream from known chunks
		const webStream = new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		});

		// Save & replace globalThis.fetch
		(globalThis as { _origFetch?: typeof fetch })._origFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			body: webStream,
			headers: {
				get: (h: string) => (h === "content-length" ? String(totalSize) : null),
			},
		} as unknown as Response);

		const progressCalls: Array<{ received: number; total: number }> = [];

		// We capture the zip bytes inside the unzip callback before cleanup removes it.
		let capturedBytes: Buffer | undefined;
		let unzipDone = false;
		const binFile = binPath(dir);
		const sentinel = sentinelPath(dir);
		const chmod = vi.fn();

		await ensureManagedMaestro({
			exists: (p) => unzipDone && (p === binFile || p === sentinel),
			// No download dep injected → uses realDownload (globalThis.fetch is stubbed)
			unzip: vi.fn(async (zipPath: string) => {
				// Read the zip while it still exists (before cleanup)
				capturedBytes = readFileSync(zipPath);
				unzipDone = true;
			}),
			chmod,
			onProgress: (received, total) => {
				progressCalls.push({ received, total });
			},
		});

		expect(capturedBytes).toBeDefined();
		// Verify the bytes written match exactly
		expect((capturedBytes as Buffer).equals(expectedBytes)).toBe(true);

		// onProgress should have been called with correct total
		expect(progressCalls.length).toBeGreaterThan(0);
		expect(progressCalls.at(-1)?.total).toBe(totalSize);
		// Final received should equal totalSize
		expect(progressCalls.at(-1)?.received).toBe(totalSize);
	});
});
