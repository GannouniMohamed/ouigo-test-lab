import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pullLatestApk } from "../../src/main/mobile/firebase";
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
			{ binaryDownloadUri: "https://signed/app.apk", buildVersion: "42" },
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

	it("met en cache par buildVersion (pas de 2e téléchargement)", async () => {
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
});
