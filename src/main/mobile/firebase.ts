import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FirebaseAppDistConfig } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

export interface FirebaseRelease {
	binaryDownloadUri: string;
	buildVersion?: string;
}

export interface FirebaseDeps {
	getAccessToken?: (keyPath: string) => Promise<string>;
	listReleases?: (
		cfg: FirebaseAppDistConfig,
		token: string,
	) => Promise<FirebaseRelease[]>;
	download?: (url: string, destPath: string) => Promise<void>;
}

const API = "https://firebaseappdistribution.googleapis.com/v1";

export function firebaseCacheDir(): string {
	const dir = join(getWorkspaceDir(), "apk-cache");
	mkdirSync(dir, { recursive: true });
	return dir;
}

// Auth réelle : clé de compte de service → jeton OAuth (scope cloud-platform).
async function realGetAccessToken(keyPath: string): Promise<string> {
	const { GoogleAuth } = await import("google-auth-library");
	const auth = new GoogleAuth({
		keyFile: keyPath,
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const { token } = await client.getAccessToken();
	if (!token) throw new Error("Jeton d'accès Firebase vide.");
	return token;
}

async function realListReleases(
	cfg: FirebaseAppDistConfig,
	token: string,
): Promise<FirebaseRelease[]> {
	const url = `${API}/projects/${cfg.projectNumber}/apps/${cfg.firebaseAppId}/releases?pageSize=1`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok)
		throw new Error(
			`Échec de l'API App Distribution (${res.status}). Vérifie le rôle et les identifiants.`,
		);
	const json = (await res.json()) as { releases?: FirebaseRelease[] };
	return json.releases ?? [];
}

async function realDownload(url: string, destPath: string): Promise<void> {
	// L'URL est signée → pas d'en-tête Authorization.
	const res = await fetch(url);
	if (!res.ok)
		throw new Error(`Échec du téléchargement du build (${res.status}).`);
	const buf = Buffer.from(await res.arrayBuffer());
	await writeFile(destPath, buf);
}

// Récupère le dernier APK depuis Firebase App Distribution et renvoie son chemin
// local (mis en cache par buildVersion). Lève une Error à message français.
export async function pullLatestApk(
	cfg: FirebaseAppDistConfig,
	deps?: FirebaseDeps,
): Promise<string> {
	const getAccessToken = deps?.getAccessToken ?? realGetAccessToken;
	const listReleases = deps?.listReleases ?? realListReleases;
	const download = deps?.download ?? realDownload;

	const token = await getAccessToken(cfg.serviceAccountKeyPath);
	const releases = await listReleases(cfg, token);
	if (releases.length === 0)
		throw new Error("Aucune release Firebase trouvée pour cette application.");

	const release = releases[0];
	if (/\.aab(\?|$)/i.test(release.binaryDownloadUri))
		throw new Error(
			"Le build Firebase est un .aab : uploade un .apk vers App Distribution (un AAB n'est pas directement installable).",
		);

	const version = release.buildVersion ?? "latest";
	const dest = join(firebaseCacheDir(), `${cfg.firebaseAppId}-${version}.apk`);
	if (existsSync(dest)) return dest;

	await download(release.binaryDownloadUri, dest);
	return dest;
}
