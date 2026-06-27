import { spawn } from "node:child_process";
import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
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

// Fichier sentinelle écrit après une extraction réussie.
function sentinelPath(dir: string): string {
	return join(dir, ".maestro-ok");
}

// Chemin du binaire après extraction (le zip s'extrait en maestro/bin/maestro).
// Renvoie undefined si absent, ou si le sentinel d'extraction est manquant
// (extraction partielle). Si le workspace est indisponible (tests unitaires
// sans OTL_WORKSPACE ni electron), on renvoie undefined sans planter.
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
	const sentinel = sentinelPath(dir);
	return exists(bin) && exists(sentinel) ? bin : undefined;
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

// Télécharge en streaming via fetch natif (Node 20). Utilise un PassThrough
// intermédiaire pour compter les octets, évitant le bug dual-consumer
// (attacher un listener 'data' et passer le stream à pipeline consomme le
// stream deux fois). Single pipeline chain: src → counter → writeStream.
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
	// PassThrough placed INSIDE the pipeline chain — single consumer for src.
	const counter = new PassThrough();
	counter.on("data", (chunk: Buffer) => {
		received += chunk.length;
		onProgress?.(received, total);
	});
	await pipeline(src, counter, createWriteStream(destPath));
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

// Singleton en vol : au plus une tentative de téléchargement à la fois.
// Les court-circuits (OTL_MAESTRO_BIN et binaire déjà présent) s'exécutent
// AVANT de prendre le verrou pour ne jamais sérialiser derrière un download.
let inflight: Promise<{ bin: string }> | undefined;

async function _doEnsure(deps: EnsureManagedDeps): Promise<{ bin: string }> {
	const download = deps.download ?? realDownload;
	const unzip = deps.unzip ?? realUnzip;
	const chmod = deps.chmod ?? chmodSync;

	const dir = managedMaestroDir();
	mkdirSync(dir, { recursive: true });
	const zipPath = join(dir, "maestro.zip");
	const maestroSubDir = join(dir, "maestro");
	const sentinel = sentinelPath(dir);

	try {
		await download(MAESTRO_ZIP_URL, zipPath, deps.onProgress);
		await unzip(zipPath, dir);
	} catch (e) {
		// Auto-guérison : on supprime le zip ET le sous-dossier d'extraction
		// partielle pour que le prochain appel repart de zéro.
		try {
			rmSync(maestroSubDir, { recursive: true, force: true });
		} catch {
			/* nettoyage best-effort */
		}
		try {
			rmSync(zipPath, { force: true });
		} catch {
			/* nettoyage best-effort */
		}
		throw e;
	}

	// Nettoyage du zip après extraction réussie.
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
	const exists = deps.exists ?? existsSync;
	if (!isWindows) chmod(bin, 0o755);
	if (!exists(bin))
		throw new Error(
			"Maestro téléchargé mais binaire introuvable après extraction.",
		);

	// Écrire le sentinel UNIQUEMENT après une extraction vérifiée (bin présent).
	writeFileSync(sentinel, "ok");

	return { bin };
}

export async function ensureManagedMaestro(
	deps: EnsureManagedDeps = {},
): Promise<{ bin: string }> {
	// Court-circuits rapides AVANT le verrou singleton.
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return { bin: override };

	const exists = deps.exists ?? existsSync;
	const existing = managedMaestroBin(exists);
	if (existing) return { bin: existing };

	// Verrou singleton : au plus un téléchargement en parallèle.
	if (inflight) return inflight;
	inflight = _doEnsure(deps).finally(() => {
		inflight = undefined;
	});
	return inflight;
}
