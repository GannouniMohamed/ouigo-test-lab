# Maestro Mobile — Phase 5 : Recorder (Studio desktop + auto-import) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer un scénario mobile en enregistrant un parcours : on lance l'app Maestro Studio desktop sur un dossier qu'on contrôle, l'utilisateur enregistre, et on importe le `.yaml` produit en un `Scenario` mobile (rebase appId + comptage d'étapes), via un `maestroRecorder` qui implémente le même contrat `start`/`stop` que le recorder web.

**Architecture:** Phase 5 sur 6 (= 1 PR). `maestroRecorder.ts` (miroir de `playwrightRecorder` : `startRecording` prépare un workspace + lance Studio ; `stopRecording` scanne le dossier, importe le flow le plus récent). Dispatch par plateforme dans `recordingHandlers`. L'auto-run après enregistrement est déjà géré par le dispatch run (Phase 3) et sera câblé côté UI en Phase 6.

**Tech Stack:** TypeScript, Node `child_process`/`fs`, Vitest, Biome. Aucune nouvelle dépendance.

**Spec maître:** `docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md` (§6 flow d'enregistrement).
**Phases acquises:** Phase 1 (`shared/flow.ts`), Phase 2 (`mobile/exec.ts`), Phase 4 (`mobile/ensureAppOnDevice.ts`).

## Global Constraints

- **Android uniquement.** Studio = app desktop **externe** (le web Studio embarquable a été retiré, CLI 2.6.0) → on ne l'embarque pas ; on lance l'app et on **surveille un dossier**.
- **Même contrat que le web** : `maestroRecorder.startRecording(opts) → { recordingId }` et `stopRecording(id) → Scenario`. Le `Scenario` mobile a `platform:"mobile"`, `specFile:"<id>.flow.yaml"`.
- **Lancement de Studio désactivable en test** : `OTL_SKIP_STUDIO_LAUNCH=1` → ne lance rien (les tests le posent). `ensureAppOnDevice` est appelé en `start` ; pour `source:"installed"` c'est un no-op (donc testable sans adb).
- **Import au `stop`** : on prend le `.yaml`/`.yml` non vide le plus récemment modifié du dossier (pas de fs.watch nécessaire pour le cœur ; la surveillance live « flow détecté » est une finition UI/Phase 6).
- **Rebase appId** au moment de l'import (vers `env.app.appId`) + `parseFlowSteps` pour `recordedStepCount`.
- **Garde-fous** (jamais de stack brute) : appId manquant, deviceId manquant, aucun flow détecté → `Error` à message français.
- Tests dans `tests/main/`. `npm test` / `npm run lint`. Commits en français.

## File Structure

- `src/main/recorder/maestroRecorder.ts` — `maestroRecorder` (start/stop), launcher Studio désactivable.
- `src/main/ipc/recordingHandlers.ts` (modif) — `StartRecordingOpts.deviceId` + dispatch par plateforme.
- `src/preload/index.ts` + `src/renderer/api.d.ts` (modif) — `deviceId?` dans les opts de `startRecording`.
- Tests : `tests/main/maestroRecorder.test.ts`, `tests/main/recordingDispatch.test.ts`.

---

### Task 1: `maestroRecorder.ts`

**Files:**
- Create: `src/main/recorder/maestroRecorder.ts`
- Test: `tests/main/maestroRecorder.test.ts`

**Interfaces:**
- Consumes: `parseFlowSteps`/`rebaseFlowAppId` (`shared/flow.ts`) ; `ensureAppOnDevice` (`mobile/ensureAppOnDevice.ts`) ; `slugify` (`recorder/slugify.ts`) ; `getEnvironment` (`stores/projectStore`) ; `getScenario`/`saveScenario` (`stores/scenarioStore`) ; `getWorkspaceDir` (`workspace`) ; `Scenario`/`Platform` types.
- Produces:
  - `interface MaestroStartOpts { name: string; environmentId: string; projectId: string; tunnelId: string; deviceId?: string }`
  - `const maestroRecorder: { startRecording(opts): Promise<{ recordingId: string }>; stopRecording(recordingId: string): Promise<Scenario> }`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/maestroRecorder.test.ts` :

```ts
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maestroRecorder } from "../../src/main/recorder/maestroRecorder";
import { getScenario } from "../../src/main/stores/scenarioStore";
import * as projectStore from "../../src/main/stores/projectStore";
import type { Project } from "../../src/shared/types";

let dir: string;

function seedProject(): void {
	const project: Project = {
		id: "p1",
		name: "P",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" },
			},
		],
	};
	projectStore.saveProject(project);
}

function recordingFolder(recordingId: string): string {
	return join(dir, "recordings", recordingId);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrec-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_SKIP_STUDIO_LAUNCH = "1";
	seedProject();
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_SKIP_STUDIO_LAUNCH"])
		Reflect.deleteProperty(process.env, k);
});

describe("maestroRecorder.startRecording", () => {
	it("crée un workspace pré-amorcé avec l'appId et renvoie un recordingId", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Mon parcours",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		expect(recordingId).toBeTruthy();
		const folder = recordingFolder(recordingId);
		expect(existsSync(folder)).toBe(true);
		const seed = readdirSync(folder).find((f) => f.endsWith(".yaml"));
		expect(seed).toBeTruthy();
		expect(readFileSync(join(folder, seed as string), "utf-8")).toContain(
			"appId: com.ouigo.app",
		);
	});

	it("sans deviceId → erreur", async () => {
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
			}),
		).rejects.toThrow(/appareil/i);
	});

	it("env sans app mobile → erreur", async () => {
		projectStore.saveProject({
			id: "p2",
			name: "P2",
			description: "",
			createdAt: "2026-06-26T00:00:00Z",
			environments: [
				{ id: "e", label: "E", baseURL: "", variables: {} },
			],
		});
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "e",
				projectId: "p2",
				tunnelId: "general",
				deviceId: "emulator-5554",
			}),
		).rejects.toThrow(/application/i);
	});
});

describe("maestroRecorder.stopRecording", () => {
	it("importe le flow le plus récent, rebase l'appId et crée le scénario", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Réservation",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		// simule l'export de Studio : un flow enregistré (appId d'un autre env)
		writeFileSync(
			join(recordingFolder(recordingId), "recorded.yaml"),
			'appId: com.autre.enregistre\n---\n- launchApp\n- tapOn: "Réserver"\n',
		);
		const scenario = await maestroRecorder.stopRecording(recordingId);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile).toBe(`${scenario.id}.flow.yaml`);
		expect(scenario.recordedStepCount).toBe(2);
		// persisté + appId rebasé vers l'env de l'enregistrement
		const saved = getScenario("p1", "general", scenario.id);
		expect(saved.name).toBe("Réservation");
		const spec = readFileSync(
			join(
				dir,
				"projects",
				"p1",
				"tunnels",
				"general",
				"scenarios",
				scenario.id,
				scenario.specFile,
			),
			"utf-8",
		);
		expect(spec).toContain("appId: com.ouigo.app");
		expect(spec).not.toContain("com.autre.enregistre");
	});

	it("aucun flow exploitable → erreur", async () => {
		const { recordingId } = await maestroRecorder.startRecording({
			name: "Vide",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			deviceId: "emulator-5554",
		});
		// on retire le fichier pré-amorcé pour simuler « rien enregistré »
		const folder = recordingFolder(recordingId);
		for (const f of readdirSync(folder)) rmSync(join(folder, f));
		await expect(maestroRecorder.stopRecording(recordingId)).rejects.toThrow(
			/flow/i,
		);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/maestroRecorder.test.ts`
Expected: FAIL — import introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/main/recorder/maestroRecorder.ts` :

```ts
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type { Scenario } from "../../shared/types";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { getEnvironment } from "../stores/projectStore";
import { getScenario, saveScenario } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { slugify } from "./slugify";

interface RecordingSession {
	folder: string;
	name: string;
	projectId: string;
	tunnelId: string;
	environmentId: string;
	appId: string;
}

const activeRecordings = new Map<string, RecordingSession>();
const isWindows = process.platform === "win32";

// Lance l'app Maestro Studio desktop sur le dossier et l'ouvre dans
// l'explorateur de fichiers. Désactivable en test via OTL_SKIP_STUDIO_LAUNCH.
function launchStudio(folder: string): void {
	if (process.env.OTL_SKIP_STUDIO_LAUNCH === "1") return;
	try {
		if (process.platform === "darwin") {
			spawn("open", ["-a", "Maestro Studio", folder], { detached: true });
			spawn("open", [folder], { detached: true });
		} else if (isWindows) {
			spawn("cmd", ["/c", "start", "", "maestro-studio"], { shell: true });
			spawn("explorer", [folder]);
		} else {
			spawn("xdg-open", [folder], { detached: true });
		}
	} catch {
		/* lancement best-effort — l'utilisateur peut ouvrir Studio à la main */
	}
}

function uniqueId(projectId: string, tunnelId: string, base: string): string {
	let candidate = base;
	let n = 2;
	while (true) {
		try {
			getScenario(projectId, tunnelId, candidate);
			candidate = `${base}-${n++}`;
		} catch {
			return candidate;
		}
	}
}

export const maestroRecorder = {
	async startRecording(opts: {
		name: string;
		environmentId: string;
		projectId: string;
		tunnelId: string;
		deviceId?: string;
	}): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
		if (!env.app?.appId)
			throw new Error(
				"Aucune application mobile configurée pour cet environnement.",
			);
		if (!opts.deviceId)
			throw new Error(
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.",
			);

		// L'app doit être présente sur l'appareil pour que Studio l'inspecte.
		const prep = await ensureAppOnDevice(env, opts.deviceId);
		if (!prep.ok) throw new Error(prep.error);

		const recordingId = randomUUID();
		const folder = join(getWorkspaceDir(), "recordings", recordingId);
		mkdirSync(folder, { recursive: true });
		// Pré-amorce un flow avec le bon appId : l'utilisateur enregistre dedans.
		writeFileSync(
			join(folder, "flow.yaml"),
			`appId: ${env.app.appId}\n---\n# Enregistre ton parcours dans Maestro Studio, puis reviens ici.\n`,
			"utf-8",
		);

		activeRecordings.set(recordingId, {
			folder,
			name: opts.name,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
			environmentId: opts.environmentId,
			appId: env.app.appId,
		});

		launchStudio(folder);
		return { recordingId };
	},

	async stopRecording(recordingId: string): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session) throw new Error(`Recording not found: ${recordingId}`);

		// Importe le flow .yaml/.yml non vide le plus récemment modifié.
		const candidates = readdirSync(session.folder)
			.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
			.map((f) => join(session.folder, f))
			.filter((p) => {
				try {
					return readFileSync(p, "utf-8").trim().length > 0;
				} catch {
					return false;
				}
			})
			.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

		if (candidates.length === 0) {
			activeRecordings.delete(recordingId);
			throw new Error(
				"Aucun flow détecté — as-tu enregistré dans le bon dossier ?",
			);
		}

		const raw = readFileSync(candidates[0], "utf-8");
		const flow = rebaseFlowAppId(raw, session.appId);
		const steps = parseFlowSteps(flow);

		const id = uniqueId(
			session.projectId,
			session.tunnelId,
			slugify(session.name),
		);
		const scenario: Scenario = {
			id,
			projectId: session.projectId,
			tunnelId: session.tunnelId,
			name: session.name,
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: session.environmentId,
			tags: [],
			specFile: `${id}.flow.yaml`,
			createdAt: new Date().toISOString(),
			recordedStepCount: steps.length,
			lastRun: { status: "never" },
		};
		saveScenario(scenario, flow);
		activeRecordings.delete(recordingId);
		return scenario;
	},
};
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/maestroRecorder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/recorder/maestroRecorder.ts tests/main/maestroRecorder.test.ts
git commit -m "feat(mobile) — maestroRecorder: Studio desktop + import du flow (start/stop)"
```

---

### Task 2: Dispatch d'enregistrement par plateforme + plomberie `deviceId`

**Files:**
- Modify: `src/main/ipc/recordingHandlers.ts`
- Modify: `src/preload/index.ts` (opts `startRecording` + `deviceId`)
- Modify: `src/renderer/api.d.ts` (opts `startRecording` + `deviceId`)
- Test: `tests/main/recordingDispatch.test.ts`

**Interfaces:**
- Consumes: `maestroRecorder` (Task 1), `playwrightRecorder` (existant).
- Produces: `StartRecordingOpts` gagne `deviceId?: string` ; `handleStartRecording`/`handleStopRecording` routent par plateforme (suivi `recordingId → recorder`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/recordingDispatch.test.ts` :

```ts
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleStartRecording,
	handleStopRecording,
} from "../../src/main/ipc/recordingHandlers";
import * as projectStore from "../../src/main/stores/projectStore";
import type { Project } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-rdisp-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_SKIP_STUDIO_LAUNCH = "1";
	const project: Project = {
		id: "p1",
		name: "P",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" },
			},
		],
	};
	projectStore.saveProject(project);
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_SKIP_STUDIO_LAUNCH"])
		Reflect.deleteProperty(process.env, k);
});

describe("dispatch d'enregistrement par plateforme", () => {
	it("platform mobile → maestroRecorder (crée un scénario mobile)", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Parcours",
			browser: "chromium",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			platform: "mobile",
			deviceId: "emulator-5554",
		});
		const folder = join(dir, "recordings", recordingId);
		writeFileSync(join(folder, "rec.yaml"), "appId: x\n---\n- launchApp\n");
		const scenario = await handleStopRecording(recordingId);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile.endsWith(".flow.yaml")).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/recordingDispatch.test.ts`
Expected: FAIL — `handleStartRecording` route encore tout vers playwrightRecorder (pas de scénario mobile / erreur).

- [ ] **Step 3: Modifier `recordingHandlers.ts`**

Remplacer le contenu de `src/main/ipc/recordingHandlers.ts` par :

```ts
import type { Platform, Scenario } from "../../shared/types";
import { maestroRecorder } from "../recorder/maestroRecorder";
import { playwrightRecorder } from "../recorder/playwrightRecorder";

export interface StartRecordingOpts {
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
	platform?: Platform;
	deviceId?: string;
}

// Suit quel recorder possède chaque recordingId (le stop ne reçoit que l'id).
const recorderByRecording = new Map<string, "mobile" | "web">();

export async function handleStartRecording(
	opts: StartRecordingOpts,
): Promise<{ recordingId: string }> {
	if (opts.platform === "mobile") {
		const r = await maestroRecorder.startRecording(opts);
		recorderByRecording.set(r.recordingId, "mobile");
		return r;
	}
	const r = await playwrightRecorder.startRecording(opts);
	recorderByRecording.set(r.recordingId, "web");
	return r;
}

export async function handleStopRecording(
	recordingId: string,
): Promise<Scenario> {
	const kind = recorderByRecording.get(recordingId);
	recorderByRecording.delete(recordingId);
	return kind === "mobile"
		? maestroRecorder.stopRecording(recordingId)
		: playwrightRecorder.stopRecording(recordingId);
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/recordingDispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Plomberie `deviceId` (preload + typage)**

Dans `src/preload/index.ts`, ajouter `deviceId?: string` à la signature de `startRecording` (objet opts) — ajouter le champ après `platform?: Platform`.

Dans `src/renderer/api.d.ts`, faire de même sur la signature `startRecording`.

(Aucun changement de comportement : les champs étaient déjà transmis tels quels par `ipcRenderer.invoke`.)

- [ ] **Step 6: Suite complète + lint + tsc**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: aucune erreur.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "maestroRecorder|recordingHandlers|preload|api.d.ts" || echo "mes fichiers OK"`
Expected: `mes fichiers OK`.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/recordingHandlers.ts src/preload/index.ts src/renderer/api.d.ts tests/main/recordingDispatch.test.ts
git commit -m "feat(mobile) — dispatch enregistrement par plateforme + deviceId (preload/typage)"
```

---

## Clôture de la Phase 5 (= ouverture de la PR)

- [ ] **Pousser + PR**

```bash
git push -u origin feat/maestro-phase5-recorder
gh pr create --title "feat(mobile) — Phase 5 : recorder (Studio desktop + auto-import)" \
  --body "Phase 5/6. maestroRecorder : startRecording prépare un workspace pré-amorcé (appId) + lance Maestro Studio desktop ; stopRecording importe le flow .yaml le plus récent (rebase appId + comptage d'étapes) en un Scenario mobile. Dispatch d'enregistrement par plateforme + plomberie deviceId. Testé sans Studio ni appareil (OTL_SKIP_STUDIO_LAUNCH, source installed). Spec : docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Critère de done** : CI verte (3 OS + E2E).

## Couverture du spec (auto-revue)

- §6 startRecording : valide appId/deviceId, ensureAppOnDevice, workspace pré-amorcé, lance Studio + ouvre le dossier → Task 1. ✅
- §6 stopRecording : importe le flow le plus récent, rebase appId, parseFlowSteps, crée+persiste le Scenario → Task 1. ✅
- §6 dispatch d'enregistrement par plateforme → Task 2. ✅
- §6 auto-run après enregistrement → déjà couvert par le dispatch run (Phase 3) ; câblage UI en Phase 6. (renvoi)
- §6 fs.watch « flow détecté » live → finition UI Phase 6 (le cœur import au stop suffit). Noté.
- §6 spike deep-link de workspace Studio → Phase 6 (le lancement best-effort + ouverture du dossier suffit en v1). Noté.
- §9 testable sans Studio/appareil → Tasks 1-2 (OTL_SKIP_STUDIO_LAUNCH, source installed). ✅
