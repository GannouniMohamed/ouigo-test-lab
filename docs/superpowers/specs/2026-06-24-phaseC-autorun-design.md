# Phase C — Auto-run — Design (spec d'implémentation)

> Statut : brainstorming, en attente de revue utilisateur.
> Date : 2026-06-24.
> Dérive de `2026-06-24-projects-maquette-alignment-design.md` §6 (design approuvé) ; spec d'implémentation focalisée, ancrée dans le code actuel.
> Phases A (PR #71) et B (PR #80) sont **mergées** sur `main`.

## 1. Objectif

Après qu'un utilisateur a **fini d'enregistrer** un nouveau scénario, lancer **automatiquement une exécution unique** de validation (au lieu de revenir au Hub), afficher l'écran **Live Run en mode « AUTO »** (badge + bandeau explicatif), et au **Hub** afficher l'état **« Nouveau » + « 1ʳᵉ exécution… »** tant que ce premier run n'est pas terminé. Au passage : relibeller le sélecteur « Tunnel » → **« Groupe »** (cohérence Phase B) et **câbler la plateforme** choisie (aujourd'hui cosmétique) jusqu'au scénario persisté.

Décisions de revue (2026-06-24) :
- **Suivi live complet** de la 1ʳᵉ exécution au Hub (champ store `firstRunScenarioId`).
- **Câbler la plateforme** (corrige un bug : le sélecteur est aujourd'hui ignoré, l'enregistreur force `"web"`).

## 2. Auto-run après enregistrement

Aujourd'hui, `NewScenario.handleStop` fait : `await window.api.stopRecording(recordingId)` puis `navigate("/scenarios")` (le `Scenario` retourné est ignoré).

**Nouveau comportement** : `stopRecording` retourne le `Scenario` persisté ; on enchaîne :
1. Résoudre l'environnement actif : `env = activeEnvByProject[activeProjectId] || envId || scenario.defaultEnvironmentId || "local"` (même précédence que le lancement au Hub).
2. Marquer le suivi : `setFirstRunScenarioId(scenario.id)` (cf. §4).
3. Lancer : `const { runId } = await window.api.runScenario(scenario.projectId, scenario.tunnelId, scenario.id, env)`.
4. Naviguer : `navigate(`/run/${runId}`, { state: { auto: true } })`.

**Gestion d'erreur** : si `runScenario` (ou `stopRecording`) lève, on **annule le suivi** (`setFirstRunScenarioId(null)`) et on retombe sur `navigate("/scenarios")` — l'enregistrement reste sauvegardé, l'utilisateur n'est pas bloqué.

Aucun nouveau canal IPC : `runScenario` (canal `scenario:run`) et `onRunEvent` existent déjà et sont inchangés.

## 3. Live Run en mode AUTO

`LiveRun` lit le runId via `useParams`. On ajoute la lecture de l'état de navigation :
- `const auto = (useLocation().state as { auto?: boolean } | null)?.auto ?? false;`

Quand `auto === true` :
- **Badge « AUTO »** dans l'en-tête (`live-run__header-left`), à côté du pill de statut.
- **Bandeau** sous l'en-tête (avant la barre de progression) : titre **« Première exécution — validation automatique »** + texte « Le scénario que vous venez d'enregistrer est lancé une fois pour vérifier qu'il fonctionne. Aucune action requise. »
- Le reste (progression, étapes, logs, aperçu) est **inchangé**. À la fin (`run-finished`) → `navigate(`/report/${runId}`)` comme aujourd'hui.

Quand `auto === false` (lancement manuel depuis le Hub) : aucun badge/bandeau, comportement identique à aujourd'hui.

Nouvelles classes `theme.css` au besoin : `.live-run__auto-badge`, `.live-run__auto-banner`.

## 4. État « Nouveau / 1ʳᵉ exécution… » au Hub (suivi live)

### 4.1 Store

`src/renderer/store.ts` gagne :
- `firstRunScenarioId: string | null` (initial `null`, **non persisté** — se réinitialise au redémarrage).
- `setFirstRunScenarioId: (id: string | null) => void`.

Posé par `NewScenario.handleStop` avant la navigation (§2). C'est l'unique « source » de l'état en cours.

### 4.2 Affichage Hub

Dans `HubLibrary.tsx`, pour chaque ligne de scénario :
- **Si `firstRunScenarioId === scenario.id`** (1ʳᵉ exécution en cours) : afficher un badge **« Nouveau »** + le texte **« 1ʳᵉ exécution… »** à la place du temps relatif/durée ; **masquer (ou désactiver)** le bouton « Lancer » (le run est déjà en cours).
- **Sinon** : comportement actuel (badge de statut `passed`/`failed`/`never`, temps relatif, durée, bouton Lancer).

### 4.3 Nettoyage du flag

Dans la fonction `reload()` du Hub (qui recharge les scénarios) : après `setScenarios(s)`, si `firstRunScenarioId` est posé **et** que le scénario correspondant existe avec `lastRun.status !== "never"` (le run a fini et a été persisté), alors `setFirstRunScenarioId(null)`. Si le scénario n'est plus dans la liste, nettoyer aussi.

Conséquence : si l'utilisateur revient au Hub **pendant** le run (statut encore `"never"`), il voit « 1ʳᵉ exécution… » ; une fois le run terminé, le rechargement suivant montre le vrai statut et efface le flag. Le flag étant non persisté, un redémarrage le nettoie de toute façon.

(Pas de badge « Nouveau » permanent pour tout scénario jamais exécuté : conformément à §6 de la maquette, « Nouveau » + « 1ʳᵉ exécution… » sont liés au **premier run en cours**, pas à l'état `never` en général qui reste « Jamais exécuté ».)

## 5. New Scenario — « Groupe » + plateforme câblée

### 5.1 Relibellé
- `src/renderer/screens/NewScenario.tsx` : le label `<div className="otl-field-label">Tunnel</div>` devient **« Groupe »**. (L'entité reste `tunnel` côté code et dans les appels IPC `listTunnels`/`tunnelId`.)
- La carte plateforme **« Web »** est relibellée **« Web Desktop »** (le `platform` reste la valeur `"web"`). « Responsive » reste « Web Responsive »/« Responsive » (libellé actuel conservé). **Mobile** et le bloc **IA** restent des placeholders **désactivés** (déjà en place via `aria-disabled` + pill « bientôt »).

### 5.2 Câblage de la plateforme (correctif de bug)
Aujourd'hui le `platform` choisi n'est **jamais transmis** : `StartRecordingOpts` n'a pas de champ `platform` et `playwrightRecorder` code en dur `platform: "web"`. On câble :
- **`StartRecordingOpts`** (`src/main/ipc/recordingHandlers.ts`) gagne `platform?: Platform` (optionnel, défaut `"web"` pour rétro-compat).
- L'enregistreur (`src/main/recorder/playwrightRecorder.ts`) **stocke** la plateforme avec la session d'enregistrement et l'utilise à `stopRecording` pour construire le `Scenario` (`platform: opts.platform ?? "web"`) au lieu du `"web"` codé en dur.
- **Parité 4 couches** : `platform?: Platform` ajouté à `startRecording` dans `preload/index.ts` et `api.d.ts` (canal `recording:start` inchangé, payload étendu).
- `NewScenario.handleStart` passe `platform` dans l'appel `startRecording`.

## 6. Hors périmètre (Phase C)
- **Exécution mobile réelle** (Maestro/Android) et **IA** — restent des placeholders désactivés.
- **Multi-navigateurs réels** — affichage seulement (Chromium à l'exécution).
- **Annuler l'auto-run** depuis le Hub / file d'attente de runs — non couvert (le run auto suit le cycle de vie normal, annulable depuis Live Run via le bouton existant).
- **Réordonnancement / déplacement** de scénarios entre groupes — non couvert.

## 7. Impacts techniques (synthèse)
- **Store** (`store.ts`) : `firstRunScenarioId` + `setFirstRunScenarioId` (non persistés).
- **Renderer** : `NewScenario.tsx` (auto-run dans `handleStop`, relibellé « Groupe », « Web Desktop », passage de `platform`) ; `LiveRun.tsx` (mode AUTO via `useLocation().state.auto`) ; `HubLibrary.tsx` (état « 1ʳᵉ exécution… » + nettoyage du flag) ; `theme.css` (badge/bandeau AUTO).
- **Main** : `recordingHandlers.ts` (`StartRecordingOpts.platform?`) ; `playwrightRecorder.ts` (persister la plateforme au lieu de `"web"` codé en dur).
- **Preload + api.d.ts** : `startRecording` payload `+ platform?: Platform`.
- **Inchangé** : `runScenario`/`scenario:run`, `onRunEvent`, le modèle de données (`Scenario.platform` existe déjà), les rapports.

## 8. Critères d'acceptation & vérification « en tant qu'utilisateur »
En plus de `npm test` + build verts (3 OS) et lint Biome propre :
1. **E2E Playwright `_electron`** (codegen stubbé via `OTL_CODEGEN`, runner stubbé via `OTL_RUNNER_CONFIG`, comme `recording.spec.ts`) : créer un scénario via l'enregistrement → à l'arrêt, **l'auto-run se déclenche** → l'écran **Live Run affiche le badge « AUTO »** et le bandeau → à la fin, arrivée sur le **Rapport**. (Pendant le run, l'état « 1ʳᵉ exécution… » est vérifiable au Hub via un test renderer plutôt qu'e2e si plus simple.)
2. **Unitaires** : store `setFirstRunScenarioId` pose/efface ; `NewScenario.handleStop` appelle `runScenario` puis `navigate("/run/<id>", { state: { auto: true } })` et pose `firstRunScenarioId` (avec fallback `/scenarios` + reset si erreur) ; `LiveRun` rend le badge/bandeau AUTO quand `state.auto` ; `HubLibrary` rend « 1ʳᵉ exécution… » et masque/désactive « Lancer » quand `firstRunScenarioId === scenario.id`, et nettoie le flag au reload quand le statut n'est plus `never` ; l'enregistreur persiste `scenario.platform = opts.platform`.
3. **Démo réelle** : lancer l'app, enregistrer un scénario factice, voir l'**auto-run → Live Run AUTO → Rapport**, et **partager des captures**.
4. **Non-régression** : le lancement manuel depuis le Hub (sans `state.auto`) reste identique (pas de badge AUTO) ; tout `npm test` + e2e existants verts.

## 9. Points par défaut retenus (à confirmer en revue)
1. **Suivi live complet** via `firstRunScenarioId` (non persisté), nettoyé au reload du Hub quand le statut n'est plus `never` (confirmé).
2. **Plateforme câblée** + « Web » → « Web Desktop », relibellé « Groupe » (confirmé).
3. Env de l'auto-run = même précédence que le Hub : `activeEnvByProject[projectId] || envId || defaultEnvironmentId || "local"`.
4. Erreur d'auto-run → fallback `/scenarios` + reset du flag (l'enregistrement reste sauvegardé).
5. **Séquence** : Phase C en une PR, mergée après CI verte par job (gate côté loop, pas de `--auto`).
