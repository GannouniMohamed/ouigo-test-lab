# Iso-maquette « Lot & Édition » + Navigation — Design

**Date :** 2026-06-25
**Statut :** validé (scope verrouillé avec l'utilisateur)

## Objectif

Aligner l'UI de OuiTest sur la maquette Claude Design « Ouigo Test Lab — Lot &
Édition » (écrans C→G) et appliquer le premier prompt Claude Design (sections
A→G). C'est une **passe de raffinement UI iso-maquette + petite plomberie** sur
des fonctionnalités déjà livrées et mergées (Feature 1 édition par mode #94,
Feature 2 lot + synthèse #95). Aucune fonctionnalité métier nouvelle.

## Décisions de scope (validées)

- **Iso-maquette intégrale** : la présentation des écrans C→G est réécrite pour
  coller à la maquette, mais **tout le comportement et le câblage existants sont
  préservés** (IPC, runner Playwright, draft model du Rapport, orchestration
  batch). Les tests existants (214 verts) servent de filet anti-régression ;
  on en ajoute par ticket.
- **Bloc « Réparation suggérée par l'IA » (Rapport) : visuel uniquement.** On
  applique le style maquette, on garde le comportement actuel (placeholder /
  suggestion non fonctionnelle). Aucune nouvelle logique IA.
- **Section B incluse** : l'écran « Nouveau scénario » perd son sélecteur
  d'environnement (env hérité du projet).
- **Hors scope** (compléments proposés puis écartés par l'utilisateur) :
  « Arrêter le lot » en cours, segment « Lot » parent dans le fil d'Ariane d'un
  run de lot, vérification des trackings, interaction Affichage × Parallèle.

## Charte (rappel, inchangée)

Sombre glassmorphique ; dégradé cyan `#00c9b1` → bleu `#2f6bff` ; erreurs rose
`#ff3366` ; succès vert ; JetBrains Mono pour durées/compteurs ; UI française ;
classes CSS existantes `otl-*` dans le CSS global du renderer.

## Architecture / conventions

- electron-vite 3 couches ; le renderer n'atteint le main que via
  `window.api.*` (parité 4 couches : preload / register / api.d.ts / handlers).
- Routage `HashRouter` (`src/renderer/App.tsx`) : `/projects`,
  `/projects/new`, `/projects/:id/environments`, `/scenarios`,
  `/scenarios/new`, `/scenarios/groups/new`, `/scenarios/groups/:tunnelId/edit`,
  `/run/:runId`, `/batch/:batchId`, `/report/:runId`, `/reports`.
- Biome (tabs, LF). Vitest + @testing-library/react. E2E Playwright `_electron`
  avec `OTL_FORCE_HEADLESS=1`. CI : Lint·Test·Build (macOS/Ubuntu/Windows) + E2E ;
  pas d'étape `tsc`.

## Découpage en tickets (1 ticket = 1 issue = 1 PR)

### T1 — A · Fil d'Ariane + bouton « ‹ Retour »

**But :** visibilité de navigation cohérente sur tous les sous-écrans.

- Nouveau composant `src/renderer/components/Breadcrumb.tsx` rendant un fil
  cliquable `Projets › [Projet] › Scénarios › … › [page courante]` et un bouton
  `‹ Retour` qui **remonte d'un niveau dans la hiérarchie** (déterministe), pas
  l'historique navigateur.
- Hiérarchie fixe par écran :
  - `/scenarios` → Projets › [Projet] › Scénarios
  - `/scenarios/new` → … › Scénarios › Nouveau scénario
  - `/scenarios/groups/new` → … › Scénarios › Nouveau groupe
  - `/scenarios/groups/:id/edit` → … › Scénarios › [Groupe] › Éditer
  - `/run/:runId` → … › Scénarios › [Scénario] › Exécution
  - `/batch/:batchId` → … › Scénarios › [Scénario] › Lot
  - `/report/:runId` → … › Scénarios › [Scénario] › Rapport
  - `/reports` → Projets › [Projet] › Rapports
  - `/projects/:id/environments` → Projets › [Projet] › Environnements
  - `/projects/new` → Projets › Nouveau projet
- Dernier segment = page courante, non cliquable, en évidence ; parents = liens
  discrets séparés par `›`. Segment dynamique [Projet]/[Groupe]/[Scénario] = vrai
  nom, tronqué `…` si long. Sur `/projects` (racine) : pas de `‹ Retour`.
- Intégré dans la barre de contexte haute (cohabite avec `ProjectContextBar`).
- **Tests :** rendu du fil par route, libellés dynamiques résolus, `Retour`
  navigue vers le parent attendu, absence sur la racine.

### T2 — B · Nouveau scénario sans sélecteur d'environnement

**But :** retirer un choix répétitif (env déjà choisi globalement).

- `src/renderer/screens/NewScenario.tsx` : supprimer `EnvPicker` et l'état
  `envId`. Afficher à la place un bandeau lecture seule
  `🔒 Environnement [label] · hérité du projet` (même style que la modale).
- L'enregistrement et l'auto-run utilisent l'env actif du projet
  (`activeEnvByProject[projectId]`) avec repli sur `defaultEnvironmentId` puis
  `"local"`. Aucune régression du flux d'enregistrement / auto-run.
- **Tests :** l'écran ne rend plus de sélecteur d'env ; le bandeau hérité
  s'affiche ; `startRecording`/auto-run reçoivent l'env hérité.

### T3 — C · Première exécution iso-maquette

**But :** écran vitrine d'auto-run propre, iso-maquette.

- `src/renderer/screens/LiveRun.tsx` (mode AUTO) : en-tête
  `Première exécution — validation automatique` + sous-texte, `TEMPS ÉCOULÉ`
  (mono) + `Arrêter`, barre de progression `Étape x sur y · [nom] · z %`,
  colonne gauche **Aperçu live** (cadre device, `Capture en direct`), colonne
  droite **Étapes du parcours** (✓ + durée mono par étape, état `en cours…`,
  `non atteint`). Fil d'Ariane (T1) `… › Exécution`.
- Comportement de run inchangé (events IPC `onRunEvent`, statut, étapes).
- **Tests :** progression et liste d'étapes rendues depuis des events simulés ;
  durée mono ; états en cours / non atteint.

### T4 — D · Modale « Lancer » iso-maquette

**But :** modale de lancement conforme.

- `src/renderer/components/RunOptionsModal.tsx` : restyle iso-maquette. Env en
  bandeau **lecture seule** `🔒 Environnement [label] · hérité du projet` (plus
  de `<select>` d'env). Bloc **Affichage** Visible/Invisible (cartes avec hint),
  **Répéter** (stepper, jusqu'à 20), et quand `repeat > 1` bloc **Mode
  d'exécution** Séquentiel (recommandé) / Parallèle (`2 appareils max`). Récap
  bas de modale adapté. Boutons `Annuler` / `▶ Démarrer`.
- L'API `onConfirm(envId, { headed, repeat, execution })` est conservée ;
  `envId` provient désormais de l'env hérité (plus d'interaction utilisateur).
- **Tests :** bandeau env lecture seule ; bloc Mode visible seulement si
  repeat>1 ; clamp du stepper ; payload `onConfirm` correct.

### T5 — E · Synthèse de lot iso-maquette

**But :** écran de synthèse KPI conforme.

- `src/renderer/screens/BatchRun.tsx` : en-tête (statut `En cours`/`Terminé`,
  nom, chips Visible/Séquentiel/env, horodatage), **bandeau KPI** : donut
  `X/N runs réussis`, `N échecs` (rose), `MIN` / `MOYENNE` / `MAX` (mono),
  calculés via `summarizeBatch`. **Exécutions du lot** : cartes
  `batch-item-N` par run (✓/✕/en cours/en attente, durée mono, `Voir le détail`
  → `/report/:runId`). Fil d'Ariane (T1) `… › Lot`.
- Abonnement `onBatchEvent` et snapshot `getBatch` inchangés.
- **Tests :** bandeau KPI depuis un snapshot ; cartes par état ; drill-down vers
  le rapport.

### T6 — F1 · Plomberie : lier chaque run d'un lot à son `batchId`

**But :** permettre le regroupement par lot dans l'historique.

- Le `Report` (et `ReportSummary`) porte un champ optionnel `batchId?: string`.
  L'orchestration batch (`src/main/runner/batchRunner.ts`) stampe le `batchId` du
  lot sur chaque `Report` produit ; `reportStore` le persiste ; `listReports`
  l'expose dans `ReportSummary`. Les runs simples gardent `batchId` indéfini.
- **Tests (main) :** un run lancé par `orchestrateBatch` produit un Report avec
  `batchId` ; un run simple n'en a pas ; `listReports` remonte le champ.

### T7 — F2 · Historique groupé par lot

**But :** voir les N-runs groupés (les deux : historique).

- `src/renderer/screens/History.tsx` : regrouper les `ReportSummary` par
  `batchId`. Un lot = bloc **repliable** (`LOT · N runs`, mode/env/horodatage,
  mini-sparkline + `MIN · MOY · MAX`, ratio `X/N`) listant ses runs
  (`Voir le détail`, run en échec en rose). Les exécutions simples
  (`batchId` indéfini) s'affichent **en ligne**. Bouton `Filtrer` (présentation).
- **Tests :** runs d'un même `batchId` regroupés et repliables ; run simple en
  ligne ; agrégats MIN/MOY/MAX du groupe corrects.

### T8 — G · Rapport iso-maquette

**But :** rapport + édition par mode conforme.

- `src/renderer/screens/Report.tsx` : bandeau **brouillon non enregistré**
  (`N modifications d'étapes en attente`, boutons `↻ Relancer` / `Enregistrer` /
  `Annuler`), en-tête (badge Échec/Réussi, métas, `MODE [Visible|Invisible]`),
  **Déroulé des étapes · édition par mode** (survol → `Ignorer…` / éditer /
  supprimer ; menu `Ignorer cette étape… → En mode invisible / En mode visible /
  Partout` ; étapes ignorées grisées), panneau droit **Capture au moment de
  l'échec** + bloc **Réparation suggérée par l'IA** (style maquette, diff
  `- / +`, `Appliquer la correction` / `Ignorer` — **visuel uniquement**).
- **Sémantique de scope préservée et critique** : le libellé nomme le mode où
  l'étape est IGNORÉE ; le scope nomme le mode où elle TOURNE (opposés).
  `Ignorer… En mode invisible` → `scope: "visible"` ; `En mode visible` →
  `scope: "invisible"` ; `Partout` → `scope: "skip"`. (C'est le bug d'inversion
  corrigé dans #94 — ne pas le réintroduire.) Draft model
  (applyEdit/relancer/enregistrer/annuler) conservé.
- **Tests :** bandeau brouillon selon modifications en attente ; mapping
  Ignorer→scope correct (anti-régression du bug d'inversion) ; grisage des
  étapes ignorées ; rendu du bloc IA.

## Ordre d'exécution

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.
Seules dépendances dures : T7 dépend de T6 ; T3/T5/T8 consomment le composant de
T1 (mais dégradent proprement si absent).

## Pilotage (boucle)

Pilotage séquentiel en session (pas de Workflow : merge irréversible à garder
sous contrôle). Par ticket : branche depuis `main` à jour → implémenteur (TDD)
→ review → `gh pr create` (`closes #issue`) → surveiller les 4 jobs CI →
`gh pr merge --squash --delete-branch` quand vert → ticket suivant, en `/loop`
jusqu'à épuisement des 8 tickets. Jamais `gh pr merge --auto` (ci-merge-gate).

## Critères de succès

- Les 8 écrans correspondent à la maquette (iso-maquette intégrale C→G + A + B).
- Aucun comportement existant cassé (runner, draft model, orchestration batch,
  mapping de scope) ; suite de tests verte en CI sur les 3 OS + E2E.
- 8 PR mergées sur `main`, une par ticket.
