# Ouigo Test Lab — Phase 1 (Exécution Web) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app Electron+React où un utilisateur non technique sélectionne un scénario Web, le lance, suit l'exécution Playwright en direct, et consulte un rapport (statut, étapes, captures sur échec).

**Architecture:** Electron 3 couches. Le *main* (Node) encapsule Playwright derrière une interface `TestRunner` et expose une API IPC typée via *preload*. Le *renderer* (React) ne connaît que `window.api` et reproduit le design dark glassmorphique. Un scénario = fichier `.spec.ts` + sidecar `.meta.json` dans le workspace `userData`.

**Tech Stack:** Electron, electron-vite, React + TypeScript, Zustand, React Router (hash), Playwright (CLI + reporter JSON), Vitest, electron-builder.

## Global Constraints

- Node ≥ 20, TypeScript strict.
- `contextIsolation: true`, `nodeIntegration: false` — le renderer n'importe JAMAIS `fs`, `child_process` ni `playwright`. Tout passe par `window.api`.
- Version Playwright **pinnée** (le parsing du reporter JSON en dépend).
- Couleurs design : primaire cyan `#00C9B1` → bleu `#2F6BFF` ; échec rose `#FF3366` ; texte `#E8EDF5` / `#94A3B8` ; monospace JetBrains Mono.
- Tous les chemins système via `app.getPath('userData')` → jamais de chemin codé en dur.
- Un commit par étape verte ; un ticket = une branche `feat/TK-xx-...` = une PR.
- Workspace racine = `app.getPath('userData')/OuigoTestLab` (en test : variable `OTL_WORKSPACE` pour pointer un dossier temporaire).

## Modèle de fichiers (décomposition)

```
src/
├── main/
│   ├── index.ts                 # bootstrap Electron, crée la fenêtre, enregistre les handlers IPC
│   ├── workspace.ts             # résout le chemin du workspace (userData ou OTL_WORKSPACE)
│   ├── stores/
│   │   ├── scenarioStore.ts     # CRUD scénarios (meta + spec)
│   │   ├── environmentStore.ts  # CRUD environnements
│   │   └── reportStore.ts       # lecture/écriture rapports normalisés
│   ├── runner/
│   │   ├── types.ts             # TestRunner, RunEvent, RunResult
│   │   ├── playwrightRunner.ts  # impl. TestRunner (spawn + parsing)
│   │   └── reportMapper.ts      # rapport Playwright JSON -> Report normalisé
│   └── ipc/
│       └── handlers.ts          # branche window.api -> stores/runner
├── preload/
│   └── index.ts                 # contextBridge: expose window.api
├── shared/
│   └── types.ts                 # types partagés main<->renderer (Scenario, Environment, Report, RunEvent)
└── renderer/
    ├── main.tsx                 # bootstrap React + Router
    ├── store.ts                 # Zustand (scénarios, run courant)
    ├── theme.css                # tokens design (couleurs, typo)
    ├── components/
    │   ├── Sidebar.tsx
    │   └── StatusBadge.tsx
    └── screens/
        ├── HubLibrary.tsx       # /scenarios
        ├── LiveRun.tsx          # /run/:runId
        └── Report.tsx           # /report/:runId
fixtures/
├── site/index.html             # mini site statique de test (login)
└── seed-scenarios/             # scénarios seed copiés au 1er lancement
.github/workflows/ci.yml
```

---

# JALON 0.0 — Boucle minimale de bout en bout

---

### Task 1 (TK-01) : Scaffold Electron + React qui démarre

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: une app electron-vite démarrable (`npm run dev`) et buildable (`npm run build`).

- [ ] **Step 1: Écrire le test smoke (échoue)**
```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';
import pkg from '../package.json';
describe('scaffold', () => {
  it('déclare les scripts essentiels', () => {
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toContain('vitest');
  });
  it('pinne playwright à une version exacte', () => {
    const v = pkg.devDependencies['@playwright/test'];
    expect(v).toMatch(/^\d+\.\d+\.\d+$/); // pas de ^ ni ~
  });
});
```
- [ ] **Step 2: Lancer le test → échoue** (`npx vitest run tests/smoke.test.ts`) — Expected: FAIL (package.json/scripts absents).
- [ ] **Step 3: Créer `package.json`** avec deps : `electron`, `electron-vite`, `vite`, `react`, `react-dom`, `react-router-dom`, `zustand`, et devDeps `@playwright/test` (version exacte, ex. `1.49.1`), `typescript`, `vitest`, `electron-builder`, `@types/*`. Scripts : `dev`, `build`, `test: "vitest run"`, `lint`.
- [ ] **Step 4: Créer la config** `electron.vite.config.ts` (3 entrées : main, preload, renderer), `tsconfig*.json` (strict), `src/main/index.ts` (crée `BrowserWindow` avec `contextIsolation:true, nodeIntegration:false, preload`), `src/preload/index.ts` (vide pour l'instant), `src/renderer/index.html`, `main.tsx`, `App.tsx` affichant « Ouigo Test Lab ».
- [ ] **Step 5: Installer + tester** : `npm install && npx vitest run tests/smoke.test.ts` — Expected: PASS. Vérifier manuellement `npm run dev` ouvre une fenêtre.
- [ ] **Step 6: Commit** : `git add -A && git commit -m "feat(TK-01): scaffold electron-vite + react"`

---

### Task 2 (TK-02) : Types partagés + résolution du workspace

**Files:**
- Create: `src/shared/types.ts`, `src/main/workspace.ts`
- Test: `tests/main/workspace.test.ts`

**Interfaces:**
- Produces:
  - `Scenario`, `Environment`, `Report`, `ReportStep`, `RunEvent`, `RunResult` (dans `shared/types.ts`)
  - `getWorkspaceDir(): string` et `ensureWorkspace(): void` (dans `workspace.ts`)

- [ ] **Step 1: Écrire le test (échoue)**
```ts
// tests/main/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getWorkspaceDir, ensureWorkspace } from '../../src/main/workspace';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'otl-')); process.env.OTL_WORKSPACE = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.OTL_WORKSPACE; });

it('utilise OTL_WORKSPACE quand défini', () => {
  expect(getWorkspaceDir()).toBe(dir);
});
it('crée les sous-dossiers scenarios/ runs/', () => {
  ensureWorkspace();
  expect(existsSync(join(dir, 'scenarios'))).toBe(true);
  expect(existsSync(join(dir, 'runs'))).toBe(true);
});
```
- [ ] **Step 2: Lancer → échoue** (`npx vitest run tests/main/workspace.test.ts`) — Expected: FAIL (module introuvable).
- [ ] **Step 3: Implémenter** `shared/types.ts` (les interfaces de la spec §4 et §3.2) et `workspace.ts` :
```ts
// src/main/workspace.ts
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function getWorkspaceDir(): string {
  if (process.env.OTL_WORKSPACE) return process.env.OTL_WORKSPACE;
  return join(app.getPath('userData'), 'OuigoTestLab');
}
export function ensureWorkspace(): void {
  const root = getWorkspaceDir();
  for (const sub of ['scenarios', 'runs']) mkdirSync(join(root, sub), { recursive: true });
}
```
> Note: importer `app` lazy ou mocker `electron` dans Vitest (alias `electron` → stub renvoyant `app.getPath`). Ajouter l'alias dans `electron.vite.config.ts`/vitest config.
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-02): types partagés + workspace"`

---

### Task 3 (TK-03) : ScenarioStore (lecture/écriture scénarios)

**Files:**
- Create: `src/main/stores/scenarioStore.ts`
- Test: `tests/main/scenarioStore.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceDir`, `Scenario` (TK-02)
- Produces: `listScenarios(): Scenario[]`, `getScenario(id): Scenario`, `saveScenario(s: Scenario, specContent: string): void`, `deleteScenario(id): void`, `updateLastRun(id, lastRun): void`

- [ ] **Step 1: Test (échoue)**
```ts
// tests/main/scenarioStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import * as store from '../../src/main/stores/scenarioStore';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(),'otl-')); process.env.OTL_WORKSPACE = dir; });
afterEach(() => { rmSync(dir,{recursive:true,force:true}); delete process.env.OTL_WORKSPACE; });

const sample = { id:'login', name:'Connexion', platform:'web', browser:'chromium',
  defaultEnvironmentId:'preprod', tags:['auth'], specFile:'login.spec.ts',
  createdAt:'2026-06-23T00:00:00Z', lastRun:{status:'never'} } as const;

it('sauvegarde puis liste un scénario', () => {
  store.saveScenario(sample as any, 'test("ok",()=>{});');
  const all = store.listScenarios();
  expect(all).toHaveLength(1);
  expect(all[0].name).toBe('Connexion');
});
it('met à jour lastRun', () => {
  store.saveScenario(sample as any, 'x');
  store.updateLastRun('login', { status:'passed', at:'2026-06-23T01:00:00Z', durationMs:1200 });
  expect(store.getScenario('login').lastRun.status).toBe('passed');
});
it('supprime un scénario', () => {
  store.saveScenario(sample as any, 'x'); store.deleteScenario('login');
  expect(store.listScenarios()).toHaveLength(0);
});
```
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `scenarioStore.ts` : chaque scénario dans `scenarios/<id>/scenario.meta.json` + `scenarios/<id>/<specFile>`. `listScenarios` parcourt les dossiers, lit chaque `scenario.meta.json`. `updateLastRun` relit/réécrit le meta. Utiliser `fs` synchrone (simple, suffisant).
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-03): scenarioStore"`

---

### Task 4 (TK-04) : EnvironmentStore

**Files:**
- Create: `src/main/stores/environmentStore.ts`, `fixtures/seed-scenarios/` (préparé ici)
- Test: `tests/main/environmentStore.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceDir`, `Environment` (TK-02)
- Produces: `listEnvironments(): Environment[]`, `saveEnvironment(e: Environment): void`, `getEnvironment(id): Environment`

- [ ] **Step 1: Test (échoue)**
```ts
// tests/main/environmentStore.test.ts
import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import * as env from '../../src/main/stores/environmentStore';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'otl-'));process.env.OTL_WORKSPACE=dir;});
afterEach(()=>{rmSync(dir,{recursive:true,force:true});delete process.env.OTL_WORKSPACE;});

it('renvoie les environnements par défaut si fichier absent', () => {
  const all = env.listEnvironments();
  expect(all.map(e=>e.id)).toContain('preprod');
});
it('persiste un environnement ajouté', () => {
  env.saveEnvironment({id:'recette',label:'Recette',baseURL:'https://r.example',variables:{}});
  expect(env.getEnvironment('recette').baseURL).toBe('https://r.example');
});
```
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `environmentStore.ts` : `environments.json` dans le workspace ; si absent, renvoyer 2 environnements par défaut (`preprod`, `recette`) et les écrire à la 1ère sauvegarde.
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-04): environmentStore"`

---

### Task 5 (TK-05) : reportMapper (Playwright JSON → Report normalisé)

**Files:**
- Create: `src/main/runner/types.ts`, `src/main/runner/reportMapper.ts`
- Test: `tests/main/reportMapper.test.ts`, `tests/fixtures/playwright-report.json`

**Interfaces:**
- Consumes: `Report`, `ReportStep` (TK-02)
- Produces: `mapPlaywrightReport(raw, ctx): Report` où `ctx = { runId, scenarioId, scenarioName, environmentLabel }`

- [ ] **Step 1: Préparer une fixture** `tests/fixtures/playwright-report.json` — un vrai rapport JSON Playwright minimal contenant 1 suite, 1 test qui échoue avec une `error.message` et un attachment `screenshot`. (Générer une fois avec un vrai run, ou écrire à la main d'après le schéma `suites[].specs[].tests[].results[]`.)
- [ ] **Step 2: Test (échoue)**
```ts
// tests/main/reportMapper.test.ts
import { it, expect } from 'vitest';
import raw from '../fixtures/playwright-report.json';
import { mapPlaywrightReport } from '../../src/main/runner/reportMapper';

it('mappe un rapport en échec avec capture', () => {
  const r = mapPlaywrightReport(raw as any, { runId:'r1', scenarioId:'login',
    scenarioName:'Connexion', environmentLabel:'Préprod' });
  expect(r.status).toBe('failed');
  expect(r.steps.some(s => s.status==='failed')).toBe(true);
  const failed = r.steps.find(s=>s.status==='failed')!;
  expect(failed.error).toBeTruthy();
  expect(failed.screenshotPath).toBeTruthy();
});
```
- [ ] **Step 3: Lancer → échoue**.
- [ ] **Step 4: Implémenter** `mapPlaywrightReport` : parcourt `suites/specs/tests/results`, transforme chaque `step`/`test` en `ReportStep`, calcule `status`/`durationMs`, extrait `error.message` et le chemin d'attachment `screenshot`.
- [ ] **Step 5: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-05): reportMapper"`

---

### Task 6 (TK-06) : PlaywrightRunner (spawn + événements + résultat)

**Files:**
- Create: `src/main/runner/playwrightRunner.ts`, `src/main/stores/reportStore.ts`
- Create: `fixtures/site/index.html`, `fixtures/seed-scenarios/passing/scenario.meta.json` + `passing.spec.ts`
- Test: `tests/main/playwrightRunner.test.ts`

**Interfaces:**
- Consumes: `TestRunner`, `RunEvent`, `RunResult` (TK-05 types), `mapPlaywrightReport`, `Scenario`, `Environment`
- Produces:
  - `playwrightRunner: TestRunner`
  - `reportStore`: `saveReport(r: Report): void`, `getReport(runId): Report`, `listReports(scenarioId?): ReportSummary[]`

- [ ] **Step 1: Fixtures** : un mini `fixtures/site/index.html` (page avec un titre `<h1>Accueil</h1>`), et un scénario seed `passing.spec.ts` qui ouvre `process.env.PLAYWRIGHT_BASE_URL` et asserte le titre. Générer le `playwright.config.ts` du workspace (screenshot only-on-failure, reporter json+line).
- [ ] **Step 2: Test d'intégration (échoue)** — lance réellement Playwright sur le scénario passant servi en `file://` ou via un petit serveur statique.
```ts
// tests/main/playwrightRunner.test.ts
import { it, expect } from 'vitest';
import { playwrightRunner } from '../../src/main/runner/playwrightRunner';
// helpers: créer workspace temp + copier fixtures/site + seed-scenario passing

it('exécute un scénario passant et émet run-finished=passed', async () => {
  const events: any[] = [];
  const res = await playwrightRunner.run(passingScenario, localEnv, e => events.push(e));
  expect(res.status).toBe('passed');
  expect(events.find(e=>e.type==='run-started')).toBeTruthy();
  expect(events.find(e=>e.type==='run-finished')?.status).toBe('passed');
}, 60_000);
```
- [ ] **Step 3: Lancer → échoue**.
- [ ] **Step 4: Implémenter** `playwrightRunner.run` : `spawn('npx', ['playwright','test', specPath, '--reporter=line,json', ...], { env: { ...process.env, PLAYWRIGHT_BASE_URL: env.baseURL, ...env.variables } })`. Lire `stdout` ligne par ligne → émettre `log` + détecter étapes. À la fin, lire le JSON → `mapPlaywrightReport` → `RunResult`. `cancel` tue le process. Écrire le rapport via `reportStore.saveReport`.
- [ ] **Step 5: Lancer → PASS** (≤60s ; prévoir `npx playwright install chromium` en pré-requis CI). **Commit** : `git commit -am "feat(TK-06): playwrightRunner + reportStore + fixtures"`

---

### Task 7 (TK-07) : Couche IPC + preload (window.api)

**Files:**
- Create: `src/main/ipc/handlers.ts`
- Modify: `src/main/index.ts` (enregistrer les handlers, `ensureWorkspace`, seed au 1er lancement), `src/preload/index.ts`
- Create: `src/renderer/api.d.ts` (typage `window.api`)
- Test: `tests/main/handlers.test.ts`

**Interfaces:**
- Consumes: tous les stores + runner
- Produces: `window.api` complet (cf. spec §3.3) ; events de run poussés via `webContents.send('run-event:'+runId, e)`.

- [ ] **Step 1: Test (échoue)** — appeler directement les fonctions de `handlers.ts` (logique pure, sans Electron) : `handleListScenarios()`, `handleRunScenario(id, envId, emit)`.
```ts
// tests/main/handlers.test.ts — vérifie que handleListScenarios renvoie les scénarios seedés
```
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `handlers.ts` (fonctions pures réutilisables) + branchement `ipcMain.handle(...)` dans `index.ts`, et `preload/index.ts` exposant `window.api` via `contextBridge` (les events de run relayés par `ipcRenderer.on`). Au démarrage : `ensureWorkspace()` + copier `fixtures/seed-scenarios/*` si workspace vide.
- [ ] **Step 4: Lancer → PASS**. Vérifier manuellement `npm run dev` (DevTools : `await window.api.listScenarios()`).
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-07): IPC + preload window.api"`

---

### Task 8 (TK-08) : Shell React — thème, sidebar, routing

**Files:**
- Create: `src/renderer/theme.css`, `src/renderer/components/Sidebar.tsx`, `src/renderer/components/StatusBadge.tsx`, `src/renderer/store.ts`
- Modify: `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Test: `tests/renderer/sidebar.test.tsx` (Vitest + @testing-library/react, jsdom)

**Interfaces:**
- Consumes: `window.api` (mocké en test)
- Produces: routes `/scenarios`, `/run/:runId`, `/report/:runId` ; `<Sidebar>` ; `<StatusBadge status>` ; store Zustand `useAppStore`.

- [ ] **Step 1: Test (échoue)** — rendu de `<Sidebar>` montre les 4 items (Scénarios, Exéc., Rapports, IA) et `IA` est marqué désactivé.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `theme.css` (tokens couleurs/typo de la spec §7), `Sidebar` (84px, items + IA disabled « bientôt »), `StatusBadge` (passed=cyan, failed=rose, never=gris), `App` avec `<HashRouter>` et les 3 routes, store Zustand.
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-08): shell react (thème, sidebar, routing)"`

---

### Task 9 (TK-09) : Écran Hub Library (liste + lancer)

**Files:**
- Create: `src/renderer/screens/HubLibrary.tsx`
- Test: `tests/renderer/hubLibrary.test.tsx`

**Interfaces:**
- Consumes: `window.api.listScenarios`, `window.api.runScenario`, navigation
- Produces: écran `/scenarios` ; clic « Lancer » → `runScenario` → navigue vers `/run/:runId`.

- [ ] **Step 1: Test (échoue)** — avec `window.api` mocké renvoyant 2 scénarios, l'écran affiche leurs noms ; clic sur Lancer appelle `runScenario(id, envId)` et navigue.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `HubLibrary` : charge les scénarios au montage, affiche les cartes (nom, plateforme/navigateur, `StatusBadge`, dernière exéc, durée monospace), bouton Lancer. Sélecteur d'environnement par défaut = `defaultEnvironmentId`.
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-09): écran Hub Library"`

---

### Task 10 (TK-10) : Écran Live Run (progression temps réel)

**Files:**
- Create: `src/renderer/screens/LiveRun.tsx`
- Test: `tests/renderer/liveRun.test.tsx`

**Interfaces:**
- Consumes: `window.api.onRunEvent`, `window.api.cancelRun`
- Produces: écran `/run/:runId` ; à `run-finished` → navigue vers `/report/:runId`.

- [ ] **Step 1: Test (échoue)** — mock `onRunEvent` qui émet `run-started → step-* → run-finished(passed)` ; l'écran affiche la progression puis déclenche la navigation vers le rapport.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `LiveRun` : s'abonne via `onRunEvent`, affiche barre de progression, liste d'étapes (courante = loader cyan, faites = ✓), chrono, bouton Stop (`cancelRun`). Désabonnement au démontage.
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-10): écran Live Run"`

---

### Task 11 (TK-11) : Écran Report (statut, étapes, capture)

**Files:**
- Create: `src/renderer/screens/Report.tsx`
- Test: `tests/renderer/report.test.tsx`

**Interfaces:**
- Consumes: `window.api.getReport`
- Produces: écran `/report/:runId` ; bloc « repair IA » présent mais **désactivé** (réservé Phase 3).

- [ ] **Step 1: Test (échoue)** — mock `getReport` renvoyant un rapport en échec ; l'écran affiche le statut Échec, les étapes ✓/✗, la raison, et la capture si présente. Le bloc repair IA est rendu `disabled`.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `Report` : charge le rapport, affiche statut (badge), liste d'étapes, message d'erreur monospace, `<img>` de la capture (`file://`), bloc IA grisé « Bientôt ».
- [ ] **Step 4: Lancer → PASS**.
- [ ] **Step 5: Commit** : `git commit -am "feat(TK-11): écran Report"`

---

### Task 12 (TK-12) : Jalon 0.0 — vérification de bout en bout (E2E)

**Files:**
- Create: `tests/e2e/happy-path.spec.ts` (Playwright pilotant l'app Electron)
- Modify: `package.json` (script `test:e2e`)

**Interfaces:**
- Consumes: l'app packagée/dev + scénario seed passant.

- [ ] **Step 1: Test E2E (échoue)** — lance l'app Electron, va sur Scénarios, lance le scénario seed passant, attend l'écran Report avec statut « Réussi ».
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Câbler** ce qui manque pour que le flux complet passe (corrections d'intégration uniquement, pas de nouvelle feature).
- [ ] **Step 4: Lancer → PASS**. **Jalon 0.0 atteint.**
- [ ] **Step 5: Commit** : `git commit -am "test(TK-12): e2e happy-path — jalon 0.0"`

---

# JALON 0.1 — Robustesse

---

### Task 13 (TK-13) : Scénario seed en échec + capture dans le Report

**Files:**
- Create: `fixtures/seed-scenarios/failing/...`
- Modify: `tests/main/playwrightRunner.test.ts`, `src/renderer/screens/Report.tsx` (si ajustements)
- Test: `tests/e2e/failure-path.spec.ts`

- [ ] **Step 1: Test (échoue)** — un scénario seed qui échoue (élément introuvable) ; le runner émet `step-failed` avec screenshot ; l'E2E vérifie le Report en Échec + image visible.
- [ ] **Step 2: Lancer → échoue**. 
- [ ] **Step 3: Implémenter** la fixture en échec + s'assurer que la capture est copiée dans `runs/<runId>/artifacts` et affichée.
- [ ] **Step 4: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-13): chemin d'échec + capture"`

---

### Task 14 (TK-14) : Historique des exécutions

**Files:**
- Modify: `src/main/stores/reportStore.ts` (`listReports`), `src/renderer/screens/HubLibrary.tsx` (badge dernière exéc cliquable), nouvel onglet/section historique
- Test: `tests/main/reportStore.history.test.ts`, `tests/renderer/history.test.tsx`

- [ ] **Step 1: Test (échoue)** — après 2 runs d'un scénario, `listReports(scenarioId)` renvoie 2 entrées triées par date desc.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** `listReports` (scanne `runs/`, lit chaque `report.json`) + UI minimale (clic sur la dernière exéc d'un scénario ouvre son rapport, lien « historique »).
- [ ] **Step 4: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-14): historique des exécutions"`

---

### Task 15 (TK-15) : Sélection d'environnement + filtres/recherche

**Files:**
- Modify: `src/renderer/screens/HubLibrary.tsx`
- Create: `src/renderer/components/EnvPicker.tsx`
- Test: `tests/renderer/filters.test.tsx`

- [ ] **Step 1: Test (échoue)** — filtres (Tous/Mobile/Web) et recherche filtrent la liste ; `EnvPicker` liste les environnements et change l'env utilisé au lancement.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** filtres + recherche (état local), `EnvPicker` alimenté par `window.api.listEnvironments`.
- [ ] **Step 4: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-15): filtres, recherche, sélection environnement"`

---

### Task 16 (TK-16) : Annulation propre d'un run

**Files:**
- Modify: `src/main/runner/playwrightRunner.ts` (`cancel`), `src/main/ipc/handlers.ts`, `src/renderer/screens/LiveRun.tsx`
- Test: `tests/main/cancel.test.ts`

- [ ] **Step 1: Test (échoue)** — lancer un scénario long, appeler `cancel(runId)`, vérifier `run-finished` avec `status:'cancelled'` et process terminé.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** kill de l'arbre de process (`tree-kill` ou `process.kill(-pid)`), émission `cancelled`, bouton Stop câblé.
- [ ] **Step 4: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-16): annulation d'un run"`

---

### Task 17 (TK-17) : Installation des navigateurs au 1er lancement

**Files:**
- Modify: `src/main/index.ts` (vérif/installation), `src/renderer/App.tsx` (écran de progression)
- Create: `src/main/runner/ensureBrowsers.ts`
- Test: `tests/main/ensureBrowsers.test.ts`

- [ ] **Step 1: Test (échoue)** — `ensureBrowsers` détecte l'absence des navigateurs et renvoie la commande d'installation ; ne réinstalle pas si déjà présents.
- [ ] **Step 2: Lancer → échoue**.
- [ ] **Step 3: Implémenter** détection (présence du cache Playwright) + `npx playwright install chromium` avec progression renvoyée à l'UI au 1er démarrage.
- [ ] **Step 4: Lancer → PASS**. **Commit** : `git commit -am "feat(TK-17): installation navigateurs au 1er lancement"`

---

### Task 18 (TK-18) : CI GitHub Actions + packaging

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (config `build` electron-builder)

**Interfaces:**
- Produces: pipeline `lint + test + build` sur chaque PR (la base de l'auto-merge V0).

- [ ] **Step 1: Écrire `ci.yml`** : matrix `macos-latest` + `windows-latest`, étapes `npm ci`, `npx playwright install --with-deps chromium`, `npm run lint`, `npm run test`, `npm run build`.
- [ ] **Step 2: Vérifier** localement `npm run lint && npm run test && npm run build` au vert.
- [ ] **Step 3: Pousser** une PR de test ; confirmer la CI verte.
- [ ] **Step 4: Commit/PR** : `git commit -am "ci(TK-18): pipeline lint/test/build + packaging"`. **Jalon 0.1 atteint.**

---

## Self-Review (couverture de la spec)

- Spec §3 (archi 3 couches + TestRunner) → TK-02, 06, 07. ✅
- Spec §4 (modèle scénario + sidecar, environnements, workspace, Report) → TK-02, 03, 04, 05, 06. ✅
- Spec §5 (exécution, logs live, rapport, captures, historique) → TK-06, 09, 10, 11, 13, 14. ✅
- Spec §7 (stack, design tokens) → TK-01, 08. ✅
- Spec §9 (stratégie de test : unit/intégration/E2E/fixtures) → présent dans chaque TK + TK-12/13. ✅
- Spec §10 (process CI/PR) → TK-18. ✅
- **Hors Phase 1 (volontaire)** : enregistrement (Phase 2) et IA (Phase 3) → plans séparés ultérieurs. La place UI (bouton enregistrer désactivé, bloc repair IA grisé) est prévue dans TK-09/11.

> **Pas de placeholder** : chaque tâche logique porte un test réel et une implémentation décrite. Les tâches UI fournissent le contrat de test (mock `window.api`) ; le détail CSS suit les tokens de `theme.css` (TK-08).
