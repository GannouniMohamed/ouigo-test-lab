# UI Polish — Lot 2 (Historique, Env hérité, Fil d'Ariane, Suppression projet)

> Spec + plan combinés (correctifs ciblés, scope maîtrisé). Date: 2026-06-25.
> Repo PUBLIC pendant ce lot (CI Actions gratuite) — repasser en privé après revue.

## Contexte

Suite à une revue visuelle de l'utilisateur, six points restent à traiter. Tous
sont des correctifs ciblés sur l'app existante (`main` @ 3b011bd). Comportement
préservé ; on corrige bugs d'affichage, une logique d'héritage d'env, et on
ajoute une garde de suppression + cascade.

## Issues, causes racines et correctifs

### #1 — Bouton « Filtrer » inactif (Historique)
**Cause :** `History.tsx:246` — `<button className="otl-hist__filter">Filtrer</button>`
sans `onClick`. C'est un no-op.
**Correctif :** un popover de filtres fonctionnel, attaché au bouton. Filtres :
**Statut** (Tous / Réussis / Échecs) et **Type** (Tous / Lots / Simples).
Le filtre s'applique à `visibleReports` (après le filtre projet/env existant T13).
État local dans `History`. Le bouton affiche un état actif (point cyan) quand un
filtre ≠ « Tous » est posé. Fermeture au clic extérieur / Échap.

### #2 — Sparkline déborde sur le ratio en parallèle (20 runs)
**Cause :** `.otl-spark { width: 64px }` mais `.otl-spark__bar { min-width: 3px }`
avec `gap: 2px`. À 20 barres, le contenu (~100px) déborde la boîte 64px sans
`overflow`, et chevauche `.otl-histgroup__ratio` (« 20/20 »).
**Correctif :** échantillonner à **au plus 16 barres** (downsample régulier en
préservant la dernière), réduire `min-width` des barres à 2px, `overflow: hidden`
+ `flex: 0 0 auto` sur `.otl-spark`, élargir à 84px. Le ratio reste lisible.
La fonction de downsample est pure et testée.

### #3 — Env hérité affiche « Local » au lieu du 1er env (Nouveau scénario)
**Cause :** `NewScenario.tsx:22-24` — `inheritedEnvId = activeEnvByProject[id] ?? ""`
puis `.find(e => e.id === "")` → undefined → fallback littéral `"Local"`. La barre
de contexte (T15) affiche pourtant `project.environments[0]` (« Préprod »).
**Correctif :** aligner sur la barre de contexte : env effectif =
`activeEnvByProject[id] || environments[0]?.id || ""`. Le bandeau affiche le label
réel ; fallback « Local » **uniquement** si le projet n'a aucun env.
`startRecording` et l'auto-run utilisent ce même env effectif (plus de `"local"`
codé en dur quand un env existe). Réactif au changement d'env dans la barre.

### #4 — Nom de projet tronqué dans le fil d'Ariane
**Cause :** `.otl-select__trigger.otl-breadcrumb__project { min-width: 0 }` + panneau
`min-width: 100%` borné à la largeur du trigger → trigger collapse (« mnt.f ») et
options tronquées (« c… », « D… », « m… »).
**Correctif :** trigger `max-width: 220px` avec ellipse seulement au-delà ;
panneau `width: max-content; min-width: 160px; max-width: 320px` (ne plus le
contraindre à `right: 0`). Les noms complets s'affichent.

### #5 — Suppression de projet : pas de confirmation + historique conservé
**Cause A :** `Projects.tsx:36-39` `remove()` appelle `deleteProject` directement,
aucune confirmation.
**Cause B :** les rapports vivent dans `<workspace>/runs/<runId>/` (indépendant de
`<workspace>/projects/<id>/`). `deleteProject` supprime le dossier projet mais
pas les runs → l'historique persiste.
**Correctif :**
- Modale de confirmation (réutilise le style modale existant) : « Supprimer le
  projet « X » ? Cette action est irréversible et supprime aussi son historique
  d'exécutions. » avec Annuler / Supprimer (danger).
- `reportStore.deleteReportsByProject(projectId, scenarioIds)` : supprime les
  dossiers run dont `report.projectId === projectId` **ou** (legacy sans
  projectId) `report.scenarioId ∈ scenarioIds`.
- `handleDeleteProject(id)` : collecte les scenarioIds du projet **avant**
  suppression, supprime le projet, puis purge les rapports. Parité IPC inchangée.

### #6 — Régénérer la preuve visuelle (T12/T14/T16) — « captures locales limitées »
Tâche de vérification (pas de PR). Avec l'app dev FERMÉE, relancer le harness
`_electron` (workspace temp + fixtures) et capturer : LiveRun étapes en direct,
Rapport capture masquée si succès / visible si échec, libellés humanisés.

## Découpage en PRs
- **PR 1** `fix(history)` : #1 + #2 (même écran/fichier, évite les conflits).
- **PR 2** `fix(scenario)` : #3.
- **PR 3** `fix(breadcrumb)` : #4.
- **PR 4** `feat(projects)` : #5 (modale + cascade).
- **#6** : tâche locale, capture remise à l'utilisateur.

## Contraintes globales (rappel)
- Parité IPC 4 couches si signature change (preload / register / api.d.ts / handlers).
- Biome (tabs, LF) : `npx biome check --write src tests`.
- TDD : test rouge → impl → vert. Vitest + @testing-library/react.
- Gate de merge : jamais `--auto` ; `gh pr checks <n> --watch` puis
  `gh pr merge <n> --squash --delete-branch` seulement si vert.
- Pas de selecteurs E2E cassés : grep `tests/e2e/` après tout renommage de classe.
