import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	firebaseCacheDir,
	pullLatestApk,
} from "../../src/main/mobile/firebase";
import type { FirebaseAppDistConfig } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-fb-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

const CFG: FirebaseAppDistConfig = {
	projectNumber: "123",
	firebaseAppId: "1:123:android:abc",
	serviceAccountKeyPath: "/keys/sa.json",
};

function deps(over: Record<string, unknown> = {}) {
	return {
		getAccessToken: async () => "tok",
		listReleases: async () => [
			{
				binaryDownloadUri: "https://signed/app.apk",
				buildVersion: "42",
				name: "projects/123/apps/1:123:android:abc/releases/r1",
			},
		],
		download: async (_url: string, dest: string) =>
			writeFileSync(dest, "APK-BYTES"),
		...over,
	};
}

describe("pullLatestApk", () => {
	it("télécharge le dernier APK et renvoie son chemin", async () => {
		const path = await pullLatestApk(CFG, deps());
		expect(existsSync(path)).toBe(true);
		expect(path.endsWith(".apk")).toBe(true);
	});

	it("nom de fichier de cache sans caractères illégaux (pas de « : » ni « / »)", async () => {
		const path = await pullLatestApk(CFG, deps());
		const file = path.slice(firebaseCacheDir().length + 1);
		expect(file).not.toMatch(/[:/\\]/);
	});

	it("met en cache par release.name stable (pas de 2e téléchargement)", async () => {
		let downloads = 0;
		const d = deps({
			download: async (_u: string, dest: string) => {
				downloads++;
				writeFileSync(dest, "APK");
			},
		});
		await pullLatestApk(CFG, d);
		await pullLatestApk(CFG, d);
		expect(downloads).toBe(1);
	});

	it("sans id stable (buildVersion seul) → ne met PAS en cache (retélécharge)", async () => {
		let downloads = 0;
		const d = deps({
			listReleases: async () => [
				{ binaryDownloadUri: "https://signed/app.apk", buildVersion: "42" },
			],
			download: async (_u: string, dest: string) => {
				downloads++;
				writeFileSync(dest, "APK");
			},
		});
		await pullLatestApk(CFG, d);
		await pullLatestApk(CFG, d);
		expect(downloads).toBe(2);
	});

	it("téléchargement échoué → pas de .apk empoisonné dans le cache", async () => {
		const d = deps({
			download: async () => {
				throw new Error("réseau coupé");
			},
		});
		await expect(pullLatestApk(CFG, d)).rejects.toThrow(/réseau/);
		// aucun .apk (ni .part) laissé dans le cache
		const path = join(
			firebaseCacheDir(),
			"1_123_android_abc-projects_123_apps_1_123_android_abc_releases_r1.apk",
		);
		expect(existsSync(path)).toBe(false);
		expect(existsSync(`${path}.part`)).toBe(false);
	});

	it("aucune release → erreur explicite", async () => {
		await expect(
			pullLatestApk(CFG, deps({ listReleases: async () => [] })),
		).rejects.toThrow(/aucune release/i);
	});

	it("binaire .aab → erreur explicite (apk requis)", async () => {
		await expect(
			pullLatestApk(
				CFG,
				deps({
					listReleases: async () => [
						{ binaryDownloadUri: "https://signed/app.aab", buildVersion: "1" },
					],
				}),
			),
		).rejects.toThrow(/apk/i);
	});

	it("#27 .aab avec fragment # → erreur explicite (apk requis)", async () => {
		await expect(
			pullLatestApk(
				CFG,
				deps({
					listReleases: async () => [
						{
							binaryDownloadUri: "https://signed/app.aab#sig",
							buildVersion: "1",
						},
					],
				}),
			),
		).rejects.toThrow(/apk/i);
	});

	it("#11 getAccessToken échoue → pullLatestApk rejette avec le message du jeton", async () => {
		await expect(
			pullLatestApk(
				CFG,
				deps({
					getAccessToken: async () => {
						throw new Error("Jeton invalide");
					},
				}),
			),
		).rejects.toThrow(/Jeton invalide/);
	});

	it("#11 listReleases retourne 4xx → pullLatestApk rejette avec message d'erreur API", async () => {
		await expect(
			pullLatestApk(
				CFG,
				deps({
					listReleases: async () => {
						throw new Error("Échec de l'API App Distribution (403)");
					},
				}),
			),
		).rejects.toThrow(/403/);
	});

	it("#24 displayVersion+buildVersion sans name → cache après 2e appel (1 seul download)", async () => {
		let downloads = 0;
		const d = deps({
			listReleases: async () => [
				{
					binaryDownloadUri: "https://signed/app.apk",
					buildVersion: "42",
					displayVersion: "1.5.0",
					// pas de name → clé de cache displayVersion-buildVersion
				},
			],
			download: async (_u: string, dest: string) => {
				downloads++;
				const { writeFileSync } = await import("node:fs");
				writeFileSync(dest, "APK");
			},
		});
		await pullLatestApk(CFG, d);
		await pullLatestApk(CFG, d);
		expect(downloads).toBe(1);
	});

	it("chemins réels (realListReleases/realDownload) via fetch stubbé", async () => {
		const calls: string[] = [];
		const orig = globalThis.fetch;
		globalThis.fetch = (async (url: string | URL) => {
			const u = String(url);
			calls.push(u);
			if (u.includes("/releases"))
				return new Response(
					JSON.stringify({
						releases: [
							{
								binaryDownloadUri: "https://signed/app.apk",
								buildVersion: "7",
								name: "projects/123/apps/1:123:android:abc/releases/rX",
							},
						],
					}),
					{ status: 200 },
				);
			return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		}) as typeof fetch;
		try {
			const path = await pullLatestApk(CFG, {
				getAccessToken: async () => "tok",
			});
			expect(existsSync(path)).toBe(true);
			expect(calls[0]).toContain(
				"/v1/projects/123/apps/1:123:android:abc/releases?pageSize=1",
			);
			expect(calls[1]).toBe("https://signed/app.apk");
		} finally {
			globalThis.fetch = orig;
		}
	});
});
