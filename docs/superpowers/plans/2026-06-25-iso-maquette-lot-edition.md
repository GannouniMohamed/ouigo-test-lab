# Iso-maquette « Lot & Édition » + Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner les écrans A→G de OuiTest sur la maquette « Lot & Édition » (iso-maquette intégrale C→G) + fil d'Ariane (A) + création sans env (B), sans casser le comportement existant.

**Architecture:** Passe de raffinement UI + petite plomberie sur des features déjà mergées. La maquette (`/Users/mohamed.gannouni/Downloads/Ouigo Test Lab - Lot & Edition.html`, capture fournie par ticket) = spec visuelle ; les fichiers existants = spec comportementale. On réécrit la présentation, on préserve le câblage (IPC, runner, draft model, orchestration batch, mapping de scope).

**Tech Stack:** Electron + React + TS (electron-vite), react-router-dom HashRouter, Vitest + @testing-library/react, Biome, CSS global `otl-*`.

## Global Constraints

- Charte : sombre glassmorphique ; dégradé cyan `#00c9b1` → bleu `#2f6bff` ; erreurs rose `#ff3366` ; succès vert ; JetBrains Mono pour durées/compteurs ; UI française.
- Renderer ↔ main uniquement via `window.api.*` ; parité 4 couches (preload / register / api.d.ts / handlers) pour tout nouvel IPC.
- Biome : tabs, LF. Lancer `npx biome check --write` avant chaque commit.
- Tests : Vitest. E2E avec `OTL_FORCE_HEADLESS=1`. Pas d'étape `tsc` en CI.
- **Sémantique de scope (NE PAS réintroduire le bug #94)** : le libellé nomme le mode où l'étape est IGNORÉE ; le scope nomme le mode où elle TOURNE. `Ignorer… En mode invisible` → `scope:"visible"` ; `En mode visible` → `scope:"invisible"` ; `Partout` → `scope:"skip"`. `stepActiveInMode(scope, mode) = (scope ?? "both")==="both" || scope===mode`.
- 1 ticket = 1 branche depuis `main` à jour = 1 PR (`closes #issue`) = merge `--squash --delete-branch` après CI verte. Jamais `--auto`.
- Commit trailers : `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: …`.

---

### Task 1 (T1): Fil d'Ariane + bouton « ‹ Retour »

**Files:**
- Create: `src/renderer/components/Breadcrumb.tsx`
- Create: `src/renderer/lib/breadcrumb.ts` (résolution route → segments)
- Modify: `src/renderer/components/ProjectContextBar.tsx` (insérer le fil + Retour)
- Modify: CSS global du renderer (classes `otl-breadcrumb*`, `otl-backbtn`)
- Test: `tests/renderer/breadcrumb.test.tsx`

**Interfaces:**
- Produces: `buildCrumbs(pathname: string, ctx: { projectName?: string; scenarioName?: string; groupName?: string }): Array<{ label: string; to?: string }>` (dernier item sans `to` = courant) ; `parentPath(pathname: string): string | null` (cible du Retour).
- Consumes: `useLocation()`, `useNavigate()` de react-router-dom ; store `useAppStore` pour le nom du projet actif.

- [ ] **Step 1: Write the failing test** — `tests/renderer/breadcrumb.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildCrumbs, parentPath } from "../../src/renderer/lib/breadcrumb";

describe("breadcrumb", () => {
	it("résout la hiérarchie d'un écran de lot", () => {
		const crumbs = buildCrumbs("/batch/abc", {
			projectName: "Ouigo.com",
			scenarioName: "Parcours de connexion",
		});
		expect(crumbs.map((c) => c.label)).toEqual([
			"Projets",
			"Ouigo.com",
			"Scénarios",
			"Parcours de connexion",
			"Lot",
		]);
		expect(crumbs.at(-1)?.to).toBeUndefined(); // courant non cliquable
	});

	it("remonte d'un niveau pour le bouton Retour", () => {
		expect(parentPath("/scenarios/new")).toBe("/scenarios");
		expect(parentPath("/projects")).toBeNull(); // racine = pas de Retour
	});
});
```

- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/renderer/breadcrumb.test.tsx` → FAIL (module introuvable).
- [ ] **Step 3: Implémenter `breadcrumb.ts`** : table route→segments selon la hiérarchie du spec (section T1) ; `parentPath` retourne le `to` de l'avant-dernier crumb (null sur `/projects`).
- [ ] **Step 4: Implémenter `Breadcrumb.tsx`** : rend les crumbs (`›` séparateur, classes `otl-breadcrumb__link`/`__sep`/`__current`), tronque `…` au-delà de ~28 car., bouton `‹ Retour` (`otl-backbtn`) masqué quand `parentPath===null`, `onClick={() => navigate(parentPath)}`. L'intégrer dans `ProjectContextBar.tsx`.
- [ ] **Step 5: Run tests** → PASS. `npx biome check --write src tests`.
- [ ] **Step 6: Commit** (`feat(nav) — fil d'Ariane cliquable + bouton Retour`).

---

### Task 2 (T2): Nouveau scénario sans sélecteur d'environnement

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx`
- Test: `tests/renderer/newScenario.test.tsx` (créer si absent)

**Interfaces:**
- Consumes: `useAppStore` → `activeProjectId`, `activeEnvByProject`. Env hérité = `activeEnvByProject[projectId] ?? scenario.defaultEnvironmentId ?? "local"`.

- [ ] **Step 1: Write the failing test** — vérifie qu'aucun sélecteur d'env n'est rendu et que le bandeau hérité s'affiche.

```tsx
// rend NewScenario avec un projet actif ayant un env "Préprod" actif
// expect(screen.queryByLabelText(/environnement/i)).not.toBeInTheDocument() pour un <select>
// expect(screen.getByText(/hérité du projet/i)).toBeInTheDocument()
```

- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémentation** : retirer `EnvPicker` + état `envId` ; afficher bandeau lecture seule `🔒 Environnement {label} · hérité du projet` ; brancher `startRecording`/auto-run sur l'env hérité (repli `defaultEnvironmentId` puis `"local"`). Conserver le reste du flux d'enregistrement inchangé.
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(scenario) — création sans sélecteur d'env (hérité du projet)`).

---

### Task 3 (T3): Première exécution iso-maquette (LiveRun AUTO)

**Files:**
- Modify: `src/renderer/screens/LiveRun.tsx`
- Modify: CSS global (`otl-firstrun*`, `otl-live*`)
- Test: `tests/renderer/liveRun.test.tsx` (étendre/créer)

**Interfaces:**
- Consumes: `window.api.onRunEvent(runId, cb)`, `Breadcrumb` (T1). Events `RunEvent` existants (run-started, step events, run-finished).

- [ ] **Step 1: Write the failing test** — depuis des events simulés, vérifie : barre `Étape X sur Y`, % calculé, étapes cochées avec durée mono, état `en cours…` sur l'étape active, `non atteint` sur les suivantes, libellé `Capture en direct`.
- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémentation iso-maquette** (cf. capture fournie : en-tête + sous-texte, `TEMPS ÉCOULÉ` mono + `Arrêter`, barre de progression, colonne Aperçu live device, colonne Étapes du parcours). **Préserver** l'abonnement IPC et la logique d'avancement.
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(live) — Première exécution iso-maquette`).

---

### Task 4 (T4): Modale « Lancer » iso-maquette

**Files:**
- Modify: `src/renderer/components/RunOptionsModal.tsx`
- Modify: `src/renderer/screens/HubLibrary.tsx` (l'appelant passe l'env hérité ; plus de sélection d'env dans la modale)
- Test: `tests/renderer/runOptionsModal.test.tsx` (étendre)

**Interfaces:**
- Produces/conserve : `onConfirm(envId: string, opts: { headed: boolean; repeat: number; execution: "sequential" | "parallel" })`. `MAX_REPEAT = 20`.
- Consumes : env hérité fourni par `HubLibrary` (`defaultEnvId`), affiché en lecture seule.

- [ ] **Step 1: Write the failing test** — bandeau env lecture seule (pas de `<select>` d'env) ; bloc « Mode d'exécution » présent seulement si `repeat>1` avec options Séquentiel / Parallèle (`2 appareils max`) ; clamp stepper [1,20] ; `onConfirm` reçoit `{headed, repeat, execution}`.
- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémentation** : remplacer le `<select>` env par bandeau `🔒 … · hérité du projet` ; restyler Affichage / Répéter / Mode d'exécution iso-maquette ; récap bas adapté (« N exécutions, 2 en parallèle… »).
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(run) — modale Lancer iso-maquette (env hérité, mode d'exécution)`).

---

### Task 5 (T5): Synthèse de lot iso-maquette (BatchRun)

**Files:**
- Modify: `src/renderer/screens/BatchRun.tsx`
- Modify: CSS global (`otl-batch*`, `otl-kpi*`, `otl-donut*`)
- Test: `tests/renderer/batchRun.test.tsx` (étendre)

**Interfaces:**
- Consumes: `window.api.getBatch`, `window.api.onBatchEvent`, `summarizeBatch(items)` → `{ passed, failed, durations: { min, avg, max } }`, `Breadcrumb` (T1).

- [ ] **Step 1: Write the failing test** — depuis un snapshot `BatchReport`, vérifie bandeau KPI (donut `X/N runs réussis`, `N échecs`, MIN/MOYENNE/MAX mono) et une carte `batch-item-N` par run avec état (✓/✕/en cours/en attente) + `Voir le détail` → `/report/:runId`.
- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémentation iso-maquette** (en-tête statut+chips, bandeau KPI, grille de cartes de run). **Préserver** snapshot + abonnement `onBatchEvent`.
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(batch) — synthèse de lot iso-maquette`).

---

### Task 6 (T6): Plomberie — `batchId` sur chaque Report d'un lot

**Files:**
- Modify: `src/shared/types.ts` (`Report` + `ReportSummary` : `batchId?: string`)
- Modify: `src/main/runner/batchRunner.ts` (passer le `batchId` au run)
- Modify: `src/main/runner/playwrightRunner.ts` et/ou `src/main/stores/reportStore.ts` (persister `batchId` ; l'inclure dans `listReports`)
- Test: `tests/main/batchRunner.test.ts` (étendre) + `tests/main/reportStore.test.ts` si présent

**Interfaces:**
- Produces: `Report.batchId?: string` et `ReportSummary.batchId?: string`. Mécanisme de passage du `batchId` au runner (param d'options de run, ex. `runner.run(scenario, env, onEvent, { batchId })`) — choisir l'extension la moins invasive et documenter la signature retenue dans le commit.
- Consumes (T7): `listReports()` retourne des `ReportSummary` avec `batchId`.

- [ ] **Step 1: Write the failing test (main)** — un run lancé via `orchestrateBatch` produit un `Report` dont `batchId === report.batchId` ; un run simple a `batchId` indéfini ; `listReports()` remonte le champ.
- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/main/batchRunner.test.ts`.
- [ ] **Step 3: Implémentation** : étendre le type, propager le `batchId` du lot jusqu'au `Report` persisté, l'exposer dans `ReportSummary`. Runs simples inchangés.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** (`feat(report) — lier chaque run d'un lot à son batchId`).

---

### Task 7 (T7): Historique groupé par lot (History)

**Files:**
- Create: `src/renderer/lib/groupReports.ts` (regroupement par `batchId`)
- Modify: `src/renderer/screens/History.tsx`
- Modify: CSS global (`otl-histgroup*`, `otl-spark*`)
- Test: `tests/renderer/history.test.tsx` (créer) + `tests/renderer/groupReports.test.ts`

**Interfaces:**
- Consumes: `window.api.listReports()` → `ReportSummary[]` avec `batchId` (T6).
- Produces: `groupReports(reports: ReportSummary[]): Array<{ kind: "single"; report: ReportSummary } | { kind: "batch"; batchId: string; runs: ReportSummary[]; stats: { passed: number; total: number; min: number; avg: number; max: number } }>` (ordre chronologique conservé sur la 1ʳᵉ occurrence du lot).

- [ ] **Step 1: Write the failing test (`groupReports.test.ts`)** — des reports partageant un `batchId` forment un groupe `kind:"batch"` avec stats MIN/MOY/MAX ; les `batchId` indéfinis donnent des `kind:"single"`.
- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémenter `groupReports.ts`** puis `History.tsx` : bloc lot repliable (`LOT · N runs`, méta, sparkline + `MIN · MOY · MAX`, ratio `X/N`, runs internes avec `Voir le détail`, échec en rose) ; exécutions simples en ligne ; bouton `Filtrer` (présentation).
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(history) — regroupement des exécutions par lot`).

---

### Task 8 (T8): Rapport iso-maquette (Report)

**Files:**
- Modify: `src/renderer/screens/Report.tsx`
- Modify: CSS global (`otl-report*`, `otl-draftbar*`, `otl-ai*`)
- Test: `tests/renderer/report.test.tsx` (étendre)

**Interfaces:**
- Consumes: draft model existant (`applyEdit`/relancer/enregistrer/annuler), `scopeChipLabel`, `Breadcrumb` (T1), `window.api.saveScenarioSpec` / `runScenario`.

- [ ] **Step 1: Write the failing test** — (a) bandeau brouillon affiché avec « N modifications d'étapes en attente » quand des édits sont en attente, masqué sinon ; (b) **anti-régression scope** : sélectionner « Ignorer… En mode invisible » applique `scope:"visible"` (et `En mode visible`→`"invisible"`, `Partout`→`"skip"`) ; (c) étape ignorée rendue grisée.
- [ ] **Step 2: Run test, verify it fails.**
- [ ] **Step 3: Implémentation iso-maquette** : bandeau brouillon (Relancer/Enregistrer/Annuler), en-tête (badge + métas + `MODE`), déroulé des étapes avec menu `Ignorer cette étape…` (En mode invisible / En mode visible / Partout) au mapping ci-dessus, grisage des ignorées, panneau Capture + bloc « Réparation suggérée par l'IA » **visuel** (diff `-/+`, boutons non fonctionnels conservant le comportement actuel). **Préserver** draft model et mapping de scope.
- [ ] **Step 4: Run tests** → PASS. Biome.
- [ ] **Step 5: Commit** (`feat(report) — rapport & édition par mode iso-maquette`).

---

## Notes d'exécution

- Avant chaque ticket : `git checkout main && git pull` (ou fast-forward local après merge précédent) puis brancher.
- La capture maquette de l'écran concerné est fournie à l'implémenteur dans son dispatch (chemin image).
- Après PR : surveiller les 4 jobs CI ; merge `--squash --delete-branch` quand vert ; passer au ticket suivant.
