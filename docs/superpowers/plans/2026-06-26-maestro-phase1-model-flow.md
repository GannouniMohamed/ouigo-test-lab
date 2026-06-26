# Maestro Mobile — Phase 1 : Modèle de données + `shared/flow.ts` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la fondation pure et testée du chemin mobile Maestro : les helpers de flow (`rebaseFlowAppId`, `parseFlowSteps`) et les champs de modèle de données (`Environment.app`, `RunOptions.deviceId`, types mobiles), sans aucune UI ni appel CLI.

**Architecture:** Phase 1 sur 6 (= 1 PR). On ajoute un module `src/shared/flow.ts` parallèle à `src/shared/spec.ts` (manipulation de texte pure, zéro dépendance) et on étend `src/shared/types.ts` de façon purement additive et optionnelle (aucune migration). Les phases suivantes (doctor/devices, runner, firebase, recorder, UI) sont décrites dans le spec maître et seront détaillées dans leur propre plan juste avant exécution.

**Tech Stack:** TypeScript, Vitest (`npm test`), Biome (`npm run lint`). Pas de nouvelle dépendance en Phase 1.

**Spec maître:** `docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md` (§5 modèle, §4 architecture).

## Global Constraints

- **Android uniquement en v1.** iOS hors-scope (ne rien ajouter pour iOS).
- **`src/shared/flow.ts` est pur** : pas d'I/O, pas d'import de `@playwright/test`, pas de dépendance npm. Manipulation de chaînes uniquement (comme `src/shared/spec.ts`).
- **Additif & optionnel** : tous les nouveaux champs de `types.ts` sont optionnels → aucune migration des données existantes.
- **Format de flow Maestro** : document YAML = en-tête (`appId:` + options) puis `---` puis liste de commandes ; un item de commande de premier niveau commence par `- ` en colonne 0 (sans indentation).
- **Langue de copie** : les titres d'étapes générés sont en français (cohérent avec le reste de l'app).
- **Tests** : `npm test` (Vitest, `vitest run`). Lint : `npm run lint`. Les tests des modules `shared`/`main` vivent dans `tests/main/`.
- **Conventions de commit** : messages en français façon repo (`feat(...) — …`, `test(...) — …`).

---

### Task 1: `rebaseFlowAppId` — réécrire l'en-tête appId d'un flow

Parallèle de `rebaseSpecUrls` (`src/shared/spec.ts:161`) : au lancement, un flow enregistré contre l'app d'un environnement doit pouvoir cibler l'app de l'environnement actif. On réécrit uniquement la ligne `appId:` de l'en-tête (avant `---`), sans toucher un éventuel override `appId:` dans un `launchApp` du corps.

**Files:**
- Create: `src/shared/flow.ts`
- Test: `tests/main/rebaseFlowAppId.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `export function rebaseFlowAppId(flow: string, appId: string): string`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/rebaseFlowAppId.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { rebaseFlowAppId } from "../../src/shared/flow";

const FLOW = `appId: com.example.recorded
---
- launchApp:
    clearState: true
- tapOn: "Connexion"
`;

describe("rebaseFlowAppId", () => {
	it("remplace l'appId de l'en-tête par celui de l'env actif", () => {
		const out = rebaseFlowAppId(FLOW, "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).not.toContain("com.example.recorded");
		// le corps reste intact
		expect(out).toContain('- tapOn: "Connexion"');
		expect(out).toContain("clearState: true");
	});

	it("ne touche pas un override appId dans le corps (après ---)", () => {
		const flow = `appId: com.example.recorded
---
- launchApp:
    appId: com.other.override
`;
		const out = rebaseFlowAppId(flow, "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).toContain("appId: com.other.override");
	});

	it("no-op quand appId est vide", () => {
		expect(rebaseFlowAppId(FLOW, "")).toBe(FLOW);
	});

	it("préfixe un en-tête appId quand le flow n'en a pas", () => {
		const flow = `---
- launchApp
`;
		const out = rebaseFlowAppId(flow, "com.ouigo.app");
		expect(out.startsWith("appId: com.ouigo.app\n")).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/rebaseFlowAppId.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/shared/flow"` (le module n'existe pas).

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/shared/flow.ts` :

```ts
import type { RecordedStep } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Moteur de flow Maestro (mobile) : helpers de texte purs, parallèles à
// src/shared/spec.ts (Playwright). Un flow est un document YAML : un en-tête
// (`appId:` + options) puis `---` puis une liste de commandes. On manipule le
// flow comme du texte, sans dépendance YAML (le module est bundlé dans le main
// Electron).
// ───────────────────────────────────────────────────────────────────────────

const APPID_RE = /^appId:\s*.*$/;
const SEPARATOR_RE = /^---\s*$/;

// Réécrit la ligne `appId:` de l'en-tête (avant le premier `---`) vers `appId`.
// N'altère pas un override `appId:` situé dans le corps (ex. sous launchApp).
// Parallèle de rebaseSpecUrls : switcher d'env switche l'app sous test.
export function rebaseFlowAppId(flow: string, appId: string): string {
	if (!appId) return flow;
	const lines = flow.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (SEPARATOR_RE.test(lines[i])) break; // fin de l'en-tête
		if (APPID_RE.test(lines[i])) {
			lines[i] = `appId: ${appId}`;
			return lines.join("\n");
		}
	}
	// Pas d'appId dans l'en-tête : on en préfixe un.
	return `appId: ${appId}\n${flow}`;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/rebaseFlowAppId.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/flow.ts tests/main/rebaseFlowAppId.test.ts
git commit -m "feat(mobile) — rebaseFlowAppId: réécrit l'appId d'en-tête d'un flow Maestro"
```

---

### Task 2: `parseFlowSteps` — compter/titrer les commandes d'un flow

Parallèle de `parseRecordedSteps` (`src/shared/spec.ts:69`) : alimente `recordedStepCount` et la liste d'étapes. Un item de commande de premier niveau commence par `- ` en colonne 0 ; les clés imbriquées (indentées) d'une commande bloc ne comptent pas.

**Files:**
- Modify: `src/shared/flow.ts`
- Test: `tests/main/parseFlowSteps.test.ts`

**Interfaces:**
- Consumes: `RecordedStep` (de `src/shared/types.ts` — `{ index: number; title: string; scope?: StepScope }`).
- Produces: `export function parseFlowSteps(flow: string): RecordedStep[]`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/parseFlowSteps.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { parseFlowSteps } from "../../src/shared/flow";

const FLOW = `appId: com.ouigo.app
---
- launchApp:
    clearState: true
- tapOn: "Connexion"
- inputText: "test@ouigo.com"
- assertVisible: "Bienvenue"
- stopApp
`;

describe("parseFlowSteps", () => {
	it("compte une étape par commande de premier niveau (pas les clés imbriquées)", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps).toHaveLength(5);
		expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
	});

	it("titre chaque étape avec le texte de la commande, sans le tiret", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps[0].title).toBe("launchApp:");
		expect(steps[1].title).toBe('tapOn: "Connexion"');
		expect(steps[4].title).toBe("stopApp");
	});

	it("ignore l'en-tête et le séparateur", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps.some((s) => s.title.includes("appId"))).toBe(false);
		expect(steps.some((s) => s.title === "---")).toBe(false);
	});

	it("renvoie [] pour un flow sans commande", () => {
		expect(parseFlowSteps("appId: com.ouigo.app\n---\n")).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/parseFlowSteps.test.ts`
Expected: FAIL — `parseFlowSteps is not a function` / import inexistant.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à la fin de `src/shared/flow.ts` :

```ts
// Item de commande de premier niveau : `- ` en colonne 0 (sans indentation).
const TOP_LEVEL_ITEM_RE = /^-\s+(.*)$/;

// Parse la liste de commandes (après `---`) en étapes, une par commande de
// premier niveau. Le titre est le texte de la commande sans le tiret de tête.
// Parallèle de parseRecordedSteps : alimente recordedStepCount.
export function parseFlowSteps(flow: string): RecordedStep[] {
	const lines = flow.split("\n");
	const sepIndex = lines.findIndex((l) => SEPARATOR_RE.test(l));
	const body = sepIndex === -1 ? lines : lines.slice(sepIndex + 1);
	const steps: RecordedStep[] = [];
	for (const line of body) {
		const m = TOP_LEVEL_ITEM_RE.exec(line);
		if (!m) continue;
		steps.push({ index: steps.length, title: m[1].trim() });
	}
	return steps;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/parseFlowSteps.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/flow.ts tests/main/parseFlowSteps.test.ts
git commit -m "feat(mobile) — parseFlowSteps: compte/titre les commandes d'un flow Maestro"
```

---

### Task 3: Modèle de données mobile dans `types.ts` (+ round-trip de persistance)

Ajoute les types mobiles et étend `Environment` / `RunOptions`. Tout est optionnel. On vérifie qu'un `Environment` portant un `app` survit à un aller-retour `saveProject`/`getProject` (le store sérialise l'objet en JSON, donc le champ optionnel doit passer tel quel).

**Files:**
- Modify: `src/shared/types.ts` (ajouts près de `Environment`, l.29-34, et `RunOptions`, l.158-168)
- Test: `tests/main/mobileAppModel.test.ts`

**Interfaces:**
- Consumes: `saveProject`, `getProject` de `src/main/stores/projectStore.ts` (signatures existantes : `saveProject(p: Project): void`, `getProject(id: string): Project`).
- Produces (nouveaux exports de `src/shared/types.ts`) :
  - `type MobileAppSource = "installed" | "firebase"`
  - `interface FirebaseAppDistConfig { projectNumber: string; firebaseAppId: string; serviceAccountKeyPath: string }`
  - `interface MobileApp { appId: string; source: MobileAppSource; firebase?: FirebaseAppDistConfig }`
  - `interface MobileDevice { id: string; name: string; kind: "emulator" | "physical"; state: "booted" | "offline" }`
  - `Environment.app?: MobileApp`
  - `RunOptions.deviceId?: string`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/mobileAppModel.test.ts` :

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/projectStore";
import type { MobileApp, Project } from "../../src/shared/types";

// Le store lit le workspace via la variable d'env OTL_WORKSPACE (voir
// src/main/workspace.ts). On l'isole dans un dossier temporaire par test, comme
// tests/main/projectStore.test.ts.
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mobile-"));
	process.env.OTL_WORKSPACE = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("modèle app mobile", () => {
	it("un Environment.app (source firebase) survit à saveProject/getProject", () => {
		const app: MobileApp = {
			appId: "com.ouigo.app",
			source: "firebase",
			firebase: {
				projectNumber: "1234567890",
				firebaseAppId: "1:1234567890:android:abc123",
				serviceAccountKeyPath: "/keys/sa.json",
			},
		};
		const project: Project = {
			id: "p1",
			name: "OUIGO Mobile",
			description: "",
			createdAt: new Date().toISOString(),
			environments: [
				{ id: "preprod", label: "Préprod", baseURL: "", variables: {}, app },
			],
		};
		store.saveProject(project);
		const loaded = store.getProject("p1");
		expect(loaded.environments[0].app).toEqual(app);
	});

	it("une source 'installed' n'a pas besoin du bloc firebase", () => {
		const app: MobileApp = { appId: "com.ouigo.app", source: "installed" };
		expect(app.firebase).toBeUndefined();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileAppModel.test.ts`
Expected: FAIL — TypeScript/Vitest : `'app' does not exist in type 'Environment'` (et `MobileApp` introuvable).

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `src/shared/types.ts`, remplacer l'interface `Environment` (l.29-34) par :

```ts
// Source du build mobile (Maestro) attaché à un environnement.
//  - "installed" : l'app est supposée déjà présente sur l'appareil (appId seul)
//  - "firebase"  : on récupère le dernier APK via Firebase App Distribution
export type MobileAppSource = "installed" | "firebase";

export interface FirebaseAppDistConfig {
	projectNumber: string; // numéro de projet Firebase (numérique)
	firebaseAppId: string; // 1:1234567890:android:abc123
	serviceAccountKeyPath: string; // chemin du JSON de compte de service
}

export interface MobileApp {
	appId: string; // package name Android (com.ouigo.app) — install/launch Maestro
	source: MobileAppSource;
	firebase?: FirebaseAppDistConfig; // présent ssi source === "firebase"
}

export interface Environment {
	id: string;
	label: string;
	baseURL: string;
	variables: Record<string, string>;
	// Mobile (Maestro) : config de l'app sous test. Optionnel — ignoré par les
	// scénarios web/responsive.
	app?: MobileApp;
}

// Appareil/émulateur mobile cible (Android en v1).
export interface MobileDevice {
	id: string; // "emulator-5554" ou UDID
	name: string; // "Pixel 6 — API 33"
	kind: "emulator" | "physical";
	state: "booted" | "offline";
}
```

Puis, dans l'interface `RunOptions` (l.158-168), ajouter le champ après `batchId?` :

```ts
	// Mobile : appareil/émulateur cible choisi au lancement.
	deviceId?: string;
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileAppModel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Vérifier que la suite complète + le lint restent verts**

Run: `npm test`
Expected: PASS (toute la suite, y compris `migration.test.ts` — `normalizePlatform` accepte déjà `"mobile"`, aucun changement requis).

Run: `npm run lint`
Expected: aucune erreur Biome.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts tests/main/mobileAppModel.test.ts
git commit -m "feat(mobile) — modèle: Environment.app (installed/firebase) + RunOptions.deviceId"
```

---

## Clôture de la Phase 1 (= ouverture de la PR)

- [ ] **Pousser la branche et ouvrir la PR**

```bash
git push -u origin design/maestro-mobile-testing
gh pr create --title "feat(mobile) — Phase 1 : modèle de données + shared/flow.ts" \
  --body "Fondation du chemin mobile Maestro (Android v1) : helpers de flow purs (rebaseFlowAppId, parseFlowSteps) + champs de modèle optionnels (Environment.app, RunOptions.deviceId, types mobiles). Aucune UI, aucun appel CLI, aucune migration. Spec : docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Critère de done** : CI verte sur la PR (Vitest + lint). Une fois mergée, on rédige le plan détaillé de la **Phase 2 (doctor + module devices + IPC/preload)** contre le code réellement mergé.

## Couverture du spec par la Phase 1 (auto-revue)

- §5 modèle (`MobileAppSource`, `FirebaseAppDistConfig`, `MobileApp`, `MobileDevice`, `Environment.app`, `RunOptions.deviceId`) → Task 3. ✅
- §5 `src/shared/flow.ts` (`rebaseFlowAppId`, `parseFlowSteps`) → Tasks 1 & 2. ✅
- §5 « additif & optionnel, aucune migration » → Task 3 (champs optionnels ; `migration.test.ts` inchangé). ✅
- §9 stratégie de test (Vitest, modules purs table-driven) → Tasks 1-3. ✅
- Phases 2-6 (doctor/devices, runner, firebase, recorder, UI) → hors Phase 1 ; chacune aura son plan dédié (voir spec §6-§8).
