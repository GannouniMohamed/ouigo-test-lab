import { describe, expect, it } from "vitest";
import { ensureAppOnDevice } from "../../src/main/mobile/ensureAppOnDevice";
import type { Environment } from "../../src/shared/types";

function env(over: Partial<Environment> = {}): Environment {
	return {
		id: "preprod",
		label: "Préprod",
		baseURL: "",
		variables: {},
		app: { appId: "com.ouigo.app", source: "installed" },
		...over,
	};
}

describe("ensureAppOnDevice", () => {
	it("source installed → ok sans rien installer", async () => {
		let ran = false;
		const r = await ensureAppOnDevice(env(), "emulator-5554", {
			run: async () => {
				ran = true;
				return { code: 0, stdout: "", stderr: "" };
			},
		});
		expect(r.ok).toBe(true);
		expect(ran).toBe(false);
	});

	it("source firebase → pull puis adb install -r", async () => {
		let installArgs: string[] = [];
		const r = await ensureAppOnDevice(
			env({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/keys/sa.json",
					},
				},
			}),
			"emulator-5554",
			{
				pull: async () => "/cache/app.apk",
				run: async (_bin, args) => {
					installArgs = args;
					return { code: 0, stdout: "Success", stderr: "" };
				},
			},
		);
		expect(r.ok).toBe(true);
		expect(installArgs).toEqual([
			"-s",
			"emulator-5554",
			"install",
			"-r",
			"/cache/app.apk",
		]);
	});

	it("échec d'install adb → ok:false + message", async () => {
		const r = await ensureAppOnDevice(
			env({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/keys/sa.json",
					},
				},
			}),
			"emulator-5554",
			{
				pull: async () => "/cache/app.apk",
				run: async () => ({
					code: 1,
					stdout: "",
					stderr: "INSTALL_FAILED_NO_MATCHING_ABIS",
				}),
			},
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("INSTALL_FAILED");
	});

	it("#10 échec adb avec raison dans stdout (stderr vide) → message contient INSTALL_FAILED", async () => {
		const r = await ensureAppOnDevice(
			env({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/keys/sa.json",
					},
				},
			}),
			"emulator-5554",
			{
				pull: async () => "/cache/app.apk",
				run: async () => ({
					code: 1,
					stdout:
						"INSTALL_FAILED_NO_MATCHING_ABIS: Failed to extract native libraries",
					stderr: "",
				}),
			},
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("INSTALL_FAILED");
	});

	it("erreur de pull Firebase → ok:false avec message Firebase", async () => {
		const r = await ensureAppOnDevice(
			env({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/keys/sa.json",
					},
				},
			}),
			"emulator-5554",
			{
				pull: async () => {
					throw new Error("Aucune release Firebase trouvée.");
				},
			},
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.toLowerCase()).toContain("firebase");
	});

	it("#25 source firebase sans config firebase → ok:false, erreur contient 'Firebase manquante'", async () => {
		const r = await ensureAppOnDevice(
			env({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					// firebase intentionnellement absent
				},
			}),
			"emulator-5554",
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/Firebase manquante/i);
	});
});
