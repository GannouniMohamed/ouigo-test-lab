import { spawn } from "node:child_process";
import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getWorkspaceDir } from "../workspace";

export const MAESTRO_VERSION = "2.5.1";
export const MAESTRO_ZIP_URL =
	"https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.5.1/maestro.zip";
const isWindows = process.platform === "win32";

// Dossier de cache du binaire géré, sous le workspace de l'app.
export function managedMaestroDir(): string {
	return join(getWorkspaceDir(), "tools", `maestro-${MAESTRO_VERSION}`);
}

// Chemin du binaire après extraction (le zip s'extrait en maestro/bin/maestro).
// Renvoie undefined si absent — et si le workspace est indisponible (tests
// unitaires sans OTL_WORKSPACE ni electron), on renvoie undefined sans planter.
export function managedMaestroBin(
	exists: (p: string) => boolean = existsSync,
): string | undefined {
	let dir: string;
	try {
		dir = managedMaestroDir();
	} catch {
		return undefined;
	}
	const bin = join(
		dir,
		"maestro",
		"bin",
		isWindows ? "maestro.bat" : "maestro",
	);
	return exists(bin) ? bin : undefined;
}

export function isManagedMaestroReady(
	exists: (p: string) => boolean = existsSync,
): boolean {
	return managedMaestroBin(exists) !== undefined;
}

export interface EnsureManagedDeps {
	download?: (
		url: string,
		destPath: string,
		onProgress?: (received: number, total: number) => void,
	) => Promise<void>;
	unzip?: (zipPath: string, destDir: string) => Promise<void>;
	exists?: (p: string) => boolean;
	chmod?: (p: string, mode: number) => void;
	onProgress?: (received: number, total: number) => void;
}

// Télécharge en streaming via fetch natif (Node 20). Non couvert en unitaire
// (injecté par les tests) — exécuté uniquement en production.
async function realDownload(
	url: string,
	destPath: string,
	onProgress?: (received: number, total: number) => void,
): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body)
		throw new Error(`Téléchargement échoué (HTTP ${res.status}).`);
	const total = Number(res.headers.get("content-length") ?? 0);
	let received = 0;
	const src = Readable.fromWeb(
		res.body as Parameters<typeof Readable.fromWeb>[0],
	);
	src.on("data", (chunk: Buffer) => {
		received += chunk.length;
		onProgress?.(received, total);
	});
	await pipeline(src, createWriteStream(destPath));
}

// Extrait le .zip via l'outil système : unzip (macOS/Linux), tar/bsdtar
// (Windows 10+). Non couvert en unitaire.
function realUnzip(zipPath: string, destDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const [cmd, cmdArgs] = isWindows
			? (["tar", ["-xf", zipPath, "-C", destDir]] as const)
			: (["unzip", ["-o", "-q", zipPath, "-d", destDir]] as const);
		const child = spawn(cmd, [...cmdArgs]);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`Extraction échouée (code ${code}).`)),
		);
	});
}

export async function ensureManagedMaestro(
	deps: EnsureManagedDeps = {},
): Promise<{ bin: string }> {
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return { bin: override };

	const exists = deps.exists ?? existsSync;
	const existing = managedMaestroBin(exists);
	if (existing) return { bin: existing };

	const download = deps.download ?? realDownload;
	const unzip = deps.unzip ?? realUnzip;
	const chmod = deps.chmod ?? chmodSync;

	const dir = managedMaestroDir();
	mkdirSync(dir, { recursive: true });
	const zipPath = join(dir, "maestro.zip");
	await download(MAESTRO_ZIP_URL, zipPath, deps.onProgress);
	await unzip(zipPath, dir);
	try {
		rmSync(zipPath, { force: true });
	} catch {
		/* nettoyage best-effort */
	}

	const bin = join(
		dir,
		"maestro",
		"bin",
		isWindows ? "maestro.bat" : "maestro",
	);
	if (!isWindows) chmod(bin, 0o755);
	if (!exists(bin))
		throw new Error(
			"Maestro téléchargé mais binaire introuvable après extraction.",
		);
	return { bin };
}
