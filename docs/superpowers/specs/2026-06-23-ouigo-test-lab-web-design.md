# Ouigo Test Lab — Conception (MVP Web : Phase 1 + Phase 2)

> **Statut** : Conception validée (architecture) — en attente de relecture finale.
> **Date** : 2026-06-23
> **Périmètre de ce document** : MVP Web complet = Phase 1 (exécution) + Phase 2 (enregistrement). Phase 3 (IA) **hors MVP**, mais sa place est réservée dans l'UI et l'architecture. Le mobile (Maestro/Android) n'est pas implémenté ici mais l'architecture est conçue pour l'accueillir sans réécriture.

---

## 1. Vision & objectif

**Ouigo Test Lab** est une application **desktop Electron + React** qui permet à des utilisateurs **non techniques** (Product Owners, testeurs fonctionnels, QA, équipes métier) de créer, exécuter et analyser des tests E2E **sans jamais écrire de code ni manipuler directement Playwright ou Maestro**.

Parcours cible de l'utilisateur final :

```
Choisir un navigateur / environnement
        ↓
Sélectionner (ou enregistrer) un scénario
        ↓
Cliquer sur « Lancer »
        ↓
Consulter le rapport (logs, captures, statut)
```

### Découpage produit (rappel)

| Version | Contenu | Dans ce MVP ? |
|---|---|---|
| **V1 / Phase 1** | Exécution de scénarios Web (Playwright), logs live, rapports, captures sur échec | ✅ Oui |
| **V2 / Phase 2** | Enregistrement de parcours Web (Playwright codegen), sans écrire de code | ✅ Oui |
| **V3 / Phase 3** | IA : génération NL→test, suggestions d'assertions, auto-réparation | ❌ Hors MVP (UI réservée) |
| **Mobile** | Détection Android, exécution Maestro | ❌ Plus tard (archi prête) |
| **iOS** | Support iPhone | ❌ Phase ultérieure (infra macOS) |

---

## 2. Public cible & principe directeur

L'utilisateur final **n'interagit qu'avec une interface simple**. Toute la complexité technique (CLI Playwright, parsing de rapports, gestion des artefacts) est encapsulée dans le *main process* Electron et **invisible** depuis l'UI.

Principe d'or : **le renderer ne sait pas que Playwright existe.** Il parle à une API abstraite. Cela garantit que le mobile (Maestro) se branchera derrière la même UI.

---

## 3. Architecture

### 3.1 Modèle de processus Electron (3 couches isolées)

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER (React)  — uniquement l'UI du design                │
│  Ne connaît que window.api.*  — aucun accès Node/fs/child_proc │
└───────────────▲─────────────────────────────────────────────┘
                │  IPC typé (contextBridge)
┌───────────────┴─────────────────────────────────────────────┐
│  PRELOAD  — pont sécurisé, expose window.api                 │
│  contextIsolation: true, nodeIntegration: false              │
└───────────────▲─────────────────────────────────────────────┘
                │  ipcMain handlers
┌───────────────┴─────────────────────────────────────────────┐
│  MAIN (Node)  — seul à toucher le système                    │
│   • ScenarioStore   (lecture/écriture scénarios + métadonnées)│
│   • EnvironmentStore (environnements)                         │
│   • TestRunner (interface)  ← PlaywrightRunner (impl.)        │
│   • RecorderService  ← PlaywrightRecorder (impl. Phase 2)     │
│   • ReportStore     (rapports + artefacts)                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 L'interface `TestRunner` (clé de la réutilisabilité mobile)

Tous les moteurs implémentent le même contrat. C'est ce qui rend le slice Web réutilisable pour le mobile.

```ts
interface TestRunner {
  // Lance un scénario dans un environnement donné.
  // Émet des événements de progression au fil de l'exécution.
  run(scenario: Scenario, env: Environment, onEvent: (e: RunEvent) => void): Promise<RunResult>;
  // Annule une exécution en cours.
  cancel(runId: string): Promise<void>;
}

type RunEvent =
  | { type: 'run-started'; runId: string; totalSteps?: number }
  | { type: 'step-started'; index: number; title: string }
  | { type: 'step-passed'; index: number; durationMs: number }
  | { type: 'step-failed'; index: number; error: string; screenshot?: string }
  | { type: 'log'; line: string }
  | { type: 'run-finished'; status: 'passed' | 'failed' | 'cancelled'; durationMs: number };
```

- **Phase 1** : `PlaywrightRunner` implémente `TestRunner`.
- **Plus tard** : `MaestroRunner` implémente la même interface → l'UI Live Run / Report ne change pas.

### 3.3 API exposée au renderer (`window.api`)

```ts
window.api = {
  // Scénarios
  listScenarios(): Promise<Scenario[]>;
  getScenario(id): Promise<Scenario>;
  deleteScenario(id): Promise<void>;
  // Environnements
  listEnvironments(): Promise<Environment[]>;
  saveEnvironment(env): Promise<void>;
  // Exécution
  runScenario(id, envId): Promise<{ runId: string }>;
  cancelRun(runId): Promise<void>;
  onRunEvent(runId, cb): UnsubscribeFn;     // flux temps réel
  // Rapports
  listReports(scenarioId?): Promise<ReportSummary[]>;
  getReport(runId): Promise<Report>;
  // Enregistrement (Phase 2)
  startRecording(opts): Promise<{ recordingId: string }>;
  stopRecording(recordingId): Promise<Scenario>;  // renvoie le scénario généré
};
```

---

## 4. Modèle de données & stockage

### 4.1 Qu'est-ce qu'un « scénario » ?

Un scénario = **un fichier de test Playwright** (`.spec.ts`) **+ un sidecar de métadonnées** (`.meta.json`). Le sidecar est ce que lit la bibliothèque ; le `.spec.ts` est ce qu'exécute Playwright.

> **Décision** : ce choix unifie Phase 1 et Phase 2. En Phase 1, des `.spec.ts` peuvent être déposés (seed) ; en Phase 2, l'enregistreur **écrit** ces mêmes fichiers. Aucun changement de modèle entre les deux phases.

```jsonc
// scenarios/parcours-connexion/scenario.meta.json
{
  "id": "parcours-connexion",
  "name": "Parcours de connexion",
  "platform": "web",                 // 'web' | 'mobile' (futur)
  "browser": "chromium",             // chromium | firefox | webkit
  "defaultEnvironmentId": "preprod",
  "tags": ["auth"],
  "specFile": "parcours-connexion.spec.ts",
  "createdAt": "2026-06-23T14:00:00Z",
  "lastRun": {                        // dénormalisé pour affichage rapide dans la liste
    "status": "passed",              // passed | failed | never
    "at": "2026-06-23T14:31:00Z",
    "durationMs": 8400
  }
}
```

### 4.2 Environnements

```jsonc
// environments.json
{
  "environments": [
    { "id": "preprod", "label": "Préprod", "baseURL": "https://preprod.ouigo.example", "variables": {} },
    { "id": "recette", "label": "Recette", "baseURL": "https://recette.ouigo.example", "variables": {} }
  ]
}
```

À l'exécution, le main injecte `baseURL` et les `variables` dans Playwright (via `PLAYWRIGHT_BASE_URL` / variables d'env). Le `.spec.ts` utilise des URLs relatives → un même scénario tourne sur n'importe quel environnement.

### 4.3 Arborescence du workspace (dans `app.getPath('userData')`)

```
OuigoTestLab/
├── environments.json
├── scenarios/
│   └── <scenario-id>/
│       ├── scenario.meta.json
│       └── <scenario-id>.spec.ts
├── runs/
│   └── <runId>/
│       ├── report.json          # rapport normalisé (modèle interne)
│       ├── playwright.json       # rapport brut Playwright
│       ├── logs.txt
│       └── artifacts/            # screenshots, traces, vidéos
└── playwright.config.ts          # config générée/gérée par l'app
```

> Un projet Playwright **géré par l'app** vit dans le workspace : `playwright.config.ts`, `package.json` minimal, navigateurs installés via `npx playwright install`. L'utilisateur ne voit jamais ces fichiers.

### 4.4 Modèle de rapport normalisé

```ts
interface Report {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  environmentLabel: string;
  status: 'passed' | 'failed' | 'cancelled';
  durationMs: number;
  startedAt: string;
  steps: ReportStep[];
}
interface ReportStep {
  index: number;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;            // message + ligne fautive
  screenshotPath?: string;   // capture sur échec
}
```

---

## 5. Phase 1 — Exécution Web

### 5.1 Fonctionnalités

1. **Bibliothèque de scénarios** (écran *Hub Library*) : liste, filtres (Tous / Mobile / Web), recherche, statut/dernière exécution/durée, bouton Lancer.
2. **Sélection d'environnement** avant lancement.
3. **Exécution Playwright** d'un scénario, sur le navigateur choisi.
4. **Logs & progression temps réel** (écran *Live Run*) : étape courante, barre de progression, chrono, bouton Stop.
5. **Rapport d'exécution** (écran *Report*) : statut, étapes (✓/✗), raison de l'échec, **capture d'écran sur échec**.
6. **Historique** des exécutions par scénario.

### 5.2 Intégration Playwright (côté main)

`PlaywrightRunner` lance le CLI Playwright en sous-processus et **parse sa sortie** :

- Commande : `npx playwright test <specFile> --reporter=line,json --output=runs/<runId>/artifacts`
- Variables injectées : `PLAYWRIGHT_BASE_URL`, variables d'environnement du scénario.
- **Logs live** : on lit `stdout`/`stderr` ligne à ligne (reporter `line`) → émission d'événements `log` et `step-*`.
- **Résultat structuré** : à la fin, on lit le JSON (reporter `json`) → on construit le `Report` normalisé.
- **Captures** : Playwright config `screenshot: 'only-on-failure'` ; les chemins sont récupérés depuis le rapport JSON et copiés dans `runs/<runId>/artifacts/`.
- **Annulation** : `cancel(runId)` tue l'arbre de process du run.

> **Pourquoi le CLI plutôt que l'API programmatique** : le reporter JSON de Playwright est stable, documenté, et donne directement étapes + erreurs + artefacts. Moins de code, plus robuste. On encapsule de toute façon derrière `TestRunner`, donc on peut changer plus tard sans toucher l'UI.

### 5.3 Flux d'exécution (séquence)

```
UI (Live Run)        Preload        Main / PlaywrightRunner
   │  runScenario(id,env) ─────────────▶ spawn `playwright test`
   │ ◀──────── runId ───────────────────┤
   │  onRunEvent(runId) ───────────────▶ s'abonne au flux
   │ ◀── run-started / step-started ─────┤  (parse stdout)
   │ ◀── step-passed / step-failed ──────┤
   │ ◀── log lines ──────────────────────┤
   │ ◀── run-finished(status,duration) ──┤  écrit report.json
   │  getReport(runId) ────────────────▶ renvoie Report normalisé
```

### 5.4 Écrans (mapping design → composants)

| Écran design | Route | Rôle Phase 1 |
|---|---|---|
| **Hub Library** | `/scenarios` | Liste + filtres + recherche + Lancer |
| **Live Run** | `/run/:runId` | Progression live, logs, Stop |
| **Report** | `/report/:runId` | Statut, étapes, capture sur échec (bloc « repair IA » présent mais désactivé) |
| **New Scenario** | `/scenarios/new` | En Phase 1 : sélection plateforme/env + (bouton « Enregistrer » activé en Phase 2) |

---

## 6. Phase 2 — Enregistrement Web

### 6.1 Fonctionnalités

```
Nouveau scénario → Démarrer l'enregistrement → l'utilisateur navigue → scénario généré automatiquement
```

- **Aucun code Playwright à écrire** par l'utilisateur.
- À l'arrêt, le scénario (`.spec.ts` + `.meta.json`) est créé et apparaît dans la bibliothèque.

### 6.2 Intégration (côté main) — `PlaywrightRecorder`

- `startRecording({ name, browser, environmentId })` lance `npx playwright codegen <baseURL> --target=playwright-test --output=<tmp>.spec.ts`.
- L'utilisateur navigue dans le navigateur ouvert par codegen ; le code se génère en continu.
- `stopRecording(recordingId)` ferme codegen, **récupère le `.spec.ts` généré**, crée le dossier scénario (`scenario.meta.json` + spec), et renvoie le `Scenario`.
- Le scénario généré est immédiatement **exécutable via la Phase 1** (même modèle de données).

### 6.3 Écran

- **New Scenario** : bouton « Démarrer l'enregistrement » → état « enregistrement en cours » → « Arrêter » → redirection vers la bibliothèque avec le nouveau scénario.

> **Non-objectif Phase 2** : pas d'édition fine des étapes dans l'UI, pas de suggestions d'assertions (c'est de l'IA → Phase 3). On enregistre, on sauvegarde, on exécute.

---

## 7. Stack technique & décisions

| Sujet | Choix | Raison |
|---|---|---|
| Desktop | **Electron** | Imposé par le besoin (accès système : CLI, fichiers, futur ADB) |
| UI | **React + TypeScript + Vite** | Standard, rapide, typé |
| Bundler Electron | **electron-vite** | Intègre Vite pour main/preload/renderer |
| Routing | **React Router** (hash) | Simple, suffisant pour une app desktop |
| État | **Zustand** (léger) | Pas besoin de Redux ; store simple pour scénarios/runs |
| Moteur Web | **Playwright** (CLI + reporter JSON) | Imposé ; reporter stable |
| Style | **CSS/Tailwind** reproduisant le design dark glassmorphique | Fidélité au design Claude |
| Tests unitaires | **Vitest** | Aligné Vite |
| Tests E2E de l'app | **Playwright** (sur l'app elle-même) | Dogfooding |
| Packaging | **electron-builder** | macOS + Windows |

### Design system (extrait du design Claude)
- Dégradé primaire : cyan `#00C9B1` → bleu `#2F6BFF` (boutons, nav active, succès, progression).
- Échec / destructif : rose `#FF3366`.
- Fond : navy très sombre, glassmorphisme (blur ~34px).
- Texte : `#E8EDF5` (principal), `#64748B` / `#94A3B8` (secondaire).
- Monospace : **JetBrains Mono** (durées, code, champs techniques).
- Nav latérale (84px) : Scénarios · Exéc. · Rapports · IA + avatar utilisateur.

---

## 8. Non-objectifs (explicitement hors MVP)

- ❌ Toute fonctionnalité IA (génération NL, assertions, auto-réparation) — Phase 3.
- ❌ Exécution mobile / Maestro / détection ADB.
- ❌ Support iOS.
- ❌ Édition manuelle fine d'un scénario étape par étape dans l'UI.
- ❌ Gestion multi-utilisateurs / cloud / partage de scénarios.
- ❌ Authentification de l'app.

L'UI **réserve la place** de l'IA et du mobile (onglets/boutons visibles, désactivés) pour éviter de retoucher la nav plus tard.

---

## 9. Stratégie de test

- **Unitaire (Vitest)** : `ScenarioStore`, `EnvironmentStore`, parsing du rapport Playwright JSON → `Report`, mapping des `RunEvent`.
- **Intégration** : `PlaywrightRunner` sur un `.spec.ts` réel minimal (succès + échec volontaire) → vérifie événements + rapport + capture.
- **E2E app (Playwright)** : lancer l'app Electron, exécuter un scénario seed, vérifier l'écran Report.
- **Fixture clé** : un mini site statique local + 2 scénarios seed (1 qui passe, 1 qui échoue) → prouvent toute la boucle sans dépendance réseau.

---

## 10. Process de développement (loop autonome + GitHub)

Objectif : un système **autonome au début (V0)** qui avance ticket par ticket, ouvre une **Pull Request GitHub** par lot, et **fusionne après validation** (automatique si la CI passe ; sinon validation humaine).

### 10.1 Découpage en tickets (TK)
La documentation sera découpée en **tickets indépendants et ordonnés** (voir plan d'implémentation à venir). Chaque ticket = une unité testable avec un critère de « terminé » clair.

### 10.2 Boucle par ticket
```
Pour chaque ticket :
  1. Branche dédiée  (feat/TK-xx-...)
  2. Implémentation en TDD (test d'abord)
  3. Vérification locale : lint + tests + build  ✅
  4. Commit + push + ouverture PR GitHub
  5. CI GitHub Actions (lint + tests + build)
       ├─ Verte  → auto-merge (V0 autonome)
       └─ Rouge ou ticket sensible → validation humaine
  6. Ticket suivant
```

### 10.3 Garde-fous (« autonome mais sûr »)
- **CI obligatoire** : aucune PR ne se fusionne sans lint + tests + build au vert.
- **Petits lots** : 1 ticket = 1 PR review-able.
- **Checkpoints humains** : décisions de design, dépendances lourdes, ou échec CI répété → on s'arrête et on te demande.
- **Reproductibilité** : tout est commité (config, fixtures, scripts CI).

### 10.4 Jalons
- **0.0** — Squelette autonome : app Electron lance, nav, bibliothèque lit des scénarios seed, **exécution Playwright d'un scénario qui marche + rapport**. Boucle de bout en bout minimale.
- **0.1** — Robustesse : échecs + captures, historique, environnements multiples, logs live propres, annulation.
- **0.2** — Phase 2 : enregistrement (codegen) → scénario sauvegardé et exécutable.
- *(Toi)* — relecture finale : « ce qui marche / ce qui ne marche pas » → tickets correctifs.

> **Note de réalisme sur l'autonomie** : je peux enchaîner les tickets, ouvrir des PR et gérer la CI dans une session de travail. Une autonomie *permanente* (cron 24/7 sans session) nécessiterait un planificateur dédié — on garde simple : on avance par sessions de loop, je m'arrête aux checkpoints. Si tu veux du vrai planifié, on l'ajoutera après le 0.0.

---

## 11. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Installation des navigateurs Playwright lourde au 1er lancement | Vérifier/installer au démarrage avec écran de progression ; documenter |
| Parsing du reporter JSON Playwright qui évolue | Pin de version Playwright ; tests d'intégration sur le format |
| Codegen (Phase 2) dépend d'une fenêtre navigateur interactive | Encapsuler ; gérer l'arrêt propre ; fallback message si codegen indisponible |
| Fidélité visuelle au design dark glassmorphique | Reproduire tokens couleurs/typo dès le squelette (0.0) |
| Différences macOS / Windows (chemins, title bar) | `app.getPath`, composants title-bar conditionnels ; CI sur les deux si possible |

---

## 12. Prochaine étape

Découper ce document en **plan d'implémentation détaillé (tickets ordonnés)** via la skill `writing-plans`, puis démarrer le jalon **0.0** en boucle autonome.
