# Maestro Mobile — Phase 4 : Firebase App Distribution (pull APK + install) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Récupérer automatiquement le dernier build APK depuis Firebase App Distribution et l'installer sur l'appareil avant le run, branché dans `maestroRunner` via `ensureAppOnDevice` — supprimant la dépendance aux pipelines pour obtenir les builds.

**Architecture:** Phase 4 sur 6 (= 1 PR). `src/main/mobile/firebase.ts` (`pullLatestApk`, dépendances injectables → tests hors-réseau). `src/main/mobile/ensureAppOnDevice.ts` (`installed` = no-op ; `firebase` = pull + `adb install`). `maestroRunner` remplace le garde-fou « firebase = Phase 4 » par un appel réel à `ensureAppOnDevice`.

**Tech Stack:** TypeScript, `google-auth-library` (nouvelle dép, pré-approuvée spec §10), `fetch` (Node 18+), Vitest, Biome.

**Spec maître:** `docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md` (§7 ensureAppOnDevice, §3 Firebase).
**Phases acquises:** Phase 2 (`mobile/exec.ts` : `runTool`/`toolBin`), Phase 3 (`maestroRunner` avec garde-fou firebase à remplacer).

## Global Constraints

- **Android uniquement.** Le build doit être un **`.apk`** côté App Distribution (un `.aab` ne donne pas de fichier directement installable — erreur mappée explicite si détecté).
- **Auth non-interactive** : clé de compte de service (JSON), scope `https://www.googleapis.com/auth/cloud-platform`, rôle *App Distribution Viewer*.
- **API REST v1 (GA)** : `GET …/v1/projects/{projectNumber}/apps/{firebaseAppId}/releases?pageSize=1` → `releases[0].binaryDownloadUri` (URL signée, expire ~1 h → on télécharge juste après l'avoir obtenue, jamais de cache de l'URL). Le téléchargement du `binaryDownloadUri` se fait **sans** en-tête Authorization (l'URL est déjà signée).
- **Identifiants distincts** : `firebaseAppId` (`1:…:android:…`) pour l'API ≠ `appId` package name (Maestro). Les deux sont dans `MobileApp`/`FirebaseAppDistConfig`.
- **Cache** par `buildVersion` (versionCode) : on ne re-télécharge pas le même build.
- **Injectable** : `pullLatestApk(cfg, cacheDir, deps?)` et `ensureAppOnDevice(env, deviceId, deps?)` reçoivent des deps stubables → les tests ne touchent jamais le réseau ni google-auth-library.
- **Jamais d'exception vers l'appelant** : `ensureAppOnDevice` renvoie `{ ok: true } | { ok: false; error: string }` (messages français).
- Tests dans `tests/main/`. `npm test` / `npm run lint`. Commits en français.

## File Structure

- `src/main/mobile/firebase.ts` — `FirebaseDeps`, `pullLatestApk`, `firebaseCacheDir`.
- `src/main/mobile/ensureAppOnDevice.ts` — `EnsureDeps`, `ensureAppOnDevice`.
- `src/main/runner/maestroRunner.ts` (modif) — remplace le garde-fou firebase par `ensureAppOnDevice`.
- `package.json` (modif) — ajoute `google-auth-library`.
- Tests : `tests/main/firebase.test.ts`, `tests/main/ensureAppOnDevice.test.ts`, `tests/main/maestroRunner.test.ts` (ajout/ajustement).

---

### Task 0: Ajouter la dépendance `google-auth-library`

- [ ] **Step 1: Installer**

Run: `npm install google-auth-library`
Expected: ajout à `dependencies` de `package.json` + `package-lock.json` mis à jour.

- [ ] **Step 2: Vérifier que rien ne casse**

Run: `npm test`
Expected: PASS (toute la suite, inchangée).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(mobile) — ajoute google-auth-library (Firebase App Distribution)"
```

---

### Task 1: `firebase.ts` — `pullLatestApk`

**Files:**
- Create: `src/main/mobile/firebase.ts`
- Test: `tests/main/firebase.test.ts`

**Interfaces:**
- Consumes: `FirebaseAppDistConfig` (`src/shared/types.ts`) ; `getWorkspaceDir` (`workspace`).
- Produces:
  - `interface FirebaseRelease { binaryDownloadUri: string; buildVersion?: string }`
  - `interface FirebaseDeps { getAccessToken?: (keyPath: string) => Promise<string>; listReleases?: (cfg: FirebaseAppDistConfig, token: string) => Promise<FirebaseRelease[]>; download?: (url: string, destPath: string) => Promise<void> }`
  - `function firebaseCacheDir(): string`
  - `function pullLatestApk(cfg: FirebaseAppDistConfig, deps?: FirebaseDeps): Promise<string>` (renvoie le chemin de l'APK ; lève une Error à message français en cas de problème)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/firebase.test.ts` :

```ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
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
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/firebase.test.ts`
Expected: FAIL — import introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/main/mobile/firebase.ts` :

```ts
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
		throw new Error(
			"Aucune release Firebase trouvée pour cette application.",
		);

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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/firebase.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/firebase.ts tests/main/firebase.test.ts
git commit -m "feat(mobile) — firebase: pullLatestApk (App Distribution REST v1, cache par build)"
```

---

### Task 2: `ensureAppOnDevice.ts`

**Files:**
- Create: `src/main/mobile/ensureAppOnDevice.ts`
- Test: `tests/main/ensureAppOnDevice.test.ts`

**Interfaces:**
- Consumes: `Environment` (`src/shared/types.ts`) ; `ToolRunner`/`runTool`/`toolBin` (`mobile/exec.ts`) ; `pullLatestApk`/`FirebaseDeps` (Task 1).
- Produces:
  - `interface EnsureDeps { run?: ToolRunner; pull?: (cfg: FirebaseAppDistConfig, fdeps?: FirebaseDeps) => Promise<string>; firebase?: FirebaseDeps }`
  - `function ensureAppOnDevice(env: Environment, deviceId: string, deps?: EnsureDeps): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/ensureAppOnDevice.test.ts` :

```ts
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
			env({ app: { appId: "com.ouigo.app", source: "firebase" } }),
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
			env({ app: { appId: "com.ouigo.app", source: "firebase" } }),
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

	it("erreur de pull Firebase → ok:false avec message Firebase", async () => {
		const r = await ensureAppOnDevice(
			env({ app: { appId: "com.ouigo.app", source: "firebase" } }),
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
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/ensureAppOnDevice.test.ts`
Expected: FAIL — import introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/main/mobile/ensureAppOnDevice.ts` :

```ts
import type { Environment, FirebaseAppDistConfig } from "../../shared/types";
import { type ToolRunner, runTool, toolBin } from "./exec";
import { type FirebaseDeps, pullLatestApk } from "./firebase";

export interface EnsureDeps {
	run?: ToolRunner;
	pull?: (cfg: FirebaseAppDistConfig, fdeps?: FirebaseDeps) => Promise<string>;
	firebase?: FirebaseDeps;
}

// Garantit que l'app est prête sur l'appareil avant le run :
//  - "installed" : supposée présente → no-op.
//  - "firebase"  : récupère le dernier APK puis `adb -s <device> install -r`.
// Ne lève jamais : renvoie un résultat discriminé à message français.
export async function ensureAppOnDevice(
	env: Environment,
	deviceId: string,
	deps?: EnsureDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const app = env.app;
	if (!app) return { ok: false, error: "Aucune application configurée." };
	if (app.source === "installed") return { ok: true };

	if (!app.firebase)
		return {
			ok: false,
			error: "Configuration Firebase manquante pour cet environnement.",
		};

	const run = deps?.run ?? runTool;
	const pull = deps?.pull ?? pullLatestApk;

	let apkPath: string;
	try {
		apkPath = await pull(app.firebase, deps?.firebase);
	} catch (err) {
		return {
			ok: false,
			error: `Firebase : ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const res = await run(toolBin("adb"), [
		"-s",
		deviceId,
		"install",
		"-r",
		apkPath,
	]);
	if (res.code !== 0)
		return {
			ok: false,
			error: `Échec de l'installation de l'APK : ${res.stderr.trim() || `adb a quitté (code ${res.code})`}`,
		};
	return { ok: true };
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/ensureAppOnDevice.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/ensureAppOnDevice.ts tests/main/ensureAppOnDevice.test.ts
git commit -m "feat(mobile) — ensureAppOnDevice: installed=no-op, firebase=pull+adb install"
```

---

### Task 3: Brancher `ensureAppOnDevice` dans `maestroRunner`

**Files:**
- Modify: `src/main/runner/maestroRunner.ts` (remplace le garde-fou firebase)
- Modify: `tests/main/maestroRunner.test.ts` (ajuste le test firebase)

**Interfaces:**
- Consumes: `ensureAppOnDevice` (Task 2).
- Produces: comportement — un scénario mobile dont l'env est en source `firebase` déclenche pull+install avant le spawn ; un échec de préparation produit un rapport d'échec mappé.

- [ ] **Step 1: Ajuster le test (échec qui guide)**

Dans `tests/main/maestroRunner.test.ts`, remplacer le test « source firebase → rapport d'échec mappé (Phase 4) » par un test qui vérifie la nouvelle réalité : sans vraie config réseau, le pull Firebase échoue proprement (le runner appelle `ensureAppOnDevice` qui lit la clé de service inexistante) → statut failed, message Firebase.

```ts
	it("source firebase sans creds valides → rapport d'échec mappé (Firebase)", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/chemin/inexistant/sa.json",
					},
				},
			}),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		expect((res.report.steps[0].error ?? "").toLowerCase()).toContain(
			"firebase",
		);
	});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/maestroRunner.test.ts`
Expected: FAIL — le runner renvoie encore le message garde-fou « Phase 4 » (et n'appelle pas ensureAppOnDevice).

- [ ] **Step 3: Modifier `maestroRunner.ts`**

Ajouter l'import :

```ts
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
```

Supprimer le garde-fou firebase :

```ts
		if (env.app.source === "firebase")
			return guard(
				"Récupération du build via Firebase App Distribution : disponible en Phase 4.",
			);
```

Puis, après le garde-fou `deviceId` (et avant la lecture du flow), insérer la préparation de l'app :

```ts
		// Prépare l'app sur l'appareil : "installed" no-op, "firebase" pull+install.
		const prep = await ensureAppOnDevice(env, deviceId);
		if (!prep.ok) return guard(prep.error);
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/maestroRunner.test.ts`
Expected: PASS (le chemin firebase échoue désormais via ensureAppOnDevice avec un message « Firebase : … » ; les autres tests inchangés).

- [ ] **Step 5: Suite complète + lint + tsc**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: aucune erreur.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "mobile|maestroRunner" || echo "mes fichiers OK"`
Expected: `mes fichiers OK`.

- [ ] **Step 6: Commit**

```bash
git add src/main/runner/maestroRunner.ts tests/main/maestroRunner.test.ts
git commit -m "feat(mobile) — maestroRunner: ensureAppOnDevice avant le run (pull+install Firebase)"
```

---

## Clôture de la Phase 4 (= ouverture de la PR)

- [ ] **Pousser + PR**

```bash
git push -u origin feat/maestro-phase4-firebase
gh pr create --title "feat(mobile) — Phase 4 : Firebase App Distribution (pull APK + install)" \
  --body "Phase 4/6. Récupération auto du dernier APK via App Distribution (REST v1, auth compte de service, cache par buildVersion) + adb install, branché dans maestroRunner via ensureAppOnDevice. Dépendances injectables → tests hors-réseau. Contrainte : builds en .apk (pas .aab). Spec : docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Critère de done** : CI verte (3 OS + E2E).

## Couverture du spec (auto-revue)

- §3/§7 pull du dernier APK (REST v1, token compte de service, binaryDownloadUri, cache) → Task 1. ✅
- §7 AAB-pas-APK → Task 1 (détection + erreur). ✅
- §7 `ensureAppOnDevice` (installed/firebase) + adb install → Task 2. ✅
- §7 intégration dans le runner → Task 3. ✅
- §10 nouvelle dép `google-auth-library` → Task 0. ✅
- §9 testable hors-réseau (deps injectables) → Tasks 1-3. ✅
- Détection .aab robuste au-delà de l'extension d'URL : best-effort en v1 (l'install adb d'un non-APK échoue → message mappé). Noté.
