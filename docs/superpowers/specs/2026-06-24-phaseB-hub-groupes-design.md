# Phase B — Hub & Groupes — Design (spec d'implémentation)

> Statut : brainstorming, en attente de revue utilisateur.
> Date : 2026-06-24.
> Dérive de `2026-06-24-projects-maquette-alignment-design.md` §5 (design approuvé) ; ce document est la **spec d'implémentation focalisée** de la Phase B, ancrée dans le code actuel.
> Phase A (Projets & navigation) est **mergée** sur `main` (PR #71).

## 1. Objectif

Enrichir le Hub pour matcher la maquette : les **scénarios sont organisés par groupe** (l'entité `tunnel` du code, relibellée « Groupe » dans l'UI), chaque groupe a une **couleur** et une **description**, le **filtre par plateforme est remplacé par un filtre par groupe**, chaque en-tête de groupe affiche un **bilan de statuts**, et chaque ligne de scénario affiche **navigateur · nombre d'étapes · temps relatif**. On peut **créer, éditer et supprimer** un groupe.

Décision de revue (2026-06-24) : **étendue = créer + éditer + supprimer** (gestion complète des groupes, symétrique avec l'édition des environnements de la Phase A).

## 2. Terminologie & modèle

- **Groupe = `tunnel`** côté code (id, fichiers, stockage inchangés) ; l'UI affiche **« Groupe »** / **« groupe de parcours »**. Aucune migration de fichiers.
- **`Tunnel` étendu** (`src/shared/types.ts`) gagne deux champs :
  - `color: string` — couleur hex (ex. `#2f6bff`).
  - `description: string` — texte libre, peut être vide.
- **Migration douce (au lecture, pas de réécriture)** : les `tunnel.json` existants n'ont pas ces champs. `listTunnels`/`getTunnel` **rétro-remplissent** les valeurs manquantes : `color` ← `DEFAULT_TUNNEL_COLOR` (`#2f6bff`), `description` ← `""`. Ainsi le renderer reçoit toujours des `Tunnel` complets sans toucher aux fichiers. Un `saveTunnel` ultérieur (édition) persiste les vraies valeurs.
- **`LastRun` étendu** (`src/shared/types.ts`) gagne `stepCount?: number` (optionnel) — le **nombre d'étapes du dernier run**, écrit en même temps que `status`/`at`/`durationMs`. Évite de relire le rapport (N+1) côté Hub. Absent ⇒ « — » (jamais exécuté, ou run d'avant cette feature).
- Le reste du modèle est **inchangé** (`Scenario.platform`/`browser`/`tunnelId`, `Project.environments`, etc.).

### 2.1 Palette de couleurs (presets)

Le sélecteur de couleur propose une palette fixe de pastilles (pas de color-picker libre) alignée sur le thème :

```
#2f6bff (bleu) · #00c9b1 (cyan) · #ff3366 (rose) · #a855f7 (violet)
#f59e0b (ambre) · #22c55e (vert) · #ec4899 (magenta) · #64748b (ardoise)
```

`DEFAULT_TUNNEL_COLOR = "#2f6bff"` (1ʳᵉ de la palette).

## 3. Changements IPC (parité 4 couches : preload / register / api.d.ts / handler)

- **`createTunnel`** : payload étendu `{ projectId, name, color?, description? }`. Le handler applique `color ?? DEFAULT_TUNNEL_COLOR` et `description ?? ""`.
- **`updateTunnel`** (nouveau canal `tunnel:update`) : `updateTunnel(t: Tunnel): Promise<Tunnel>`. Persiste `name`/`color`/`description` via `saveTunnel` en **préservant** `id`/`projectId`/`order`/`createdAt` (lecture du tunnel existant, merge des champs éditables). Lève si le tunnel n'existe pas.
- **`deleteTunnel`** : **inchangé** (existe déjà : `tunnel:delete`, bloque si dernier groupe ou groupe non vide).
- **`listTunnels`/`getTunnel`** : signatures inchangées, mais rétro-remplissent `color`/`description` (cf. §2).

## 4. Hub enrichi (`src/renderer/screens/HubLibrary.tsx`)

### 4.1 Filtre par groupe (remplace le filtre plateforme)

- Les onglets actuels `Tous / Web / Responsive / Mobile` (par **plateforme**) sont **remplacés** par des onglets **par groupe** :
  - **« Tous · N »** (N = total des scénarios visibles, hors filtre groupe).
  - Un onglet par groupe : **« <NomGroupe> · n »**, avec une **pastille couleur** devant le nom.
  - Un bouton **`+`** en fin d'onglets → navigue vers `/scenarios/groups/new`.
- Le champ **Rechercher…** est conservé (filtre par nom, cumulatif avec le filtre groupe).
- État du filtre : `groupFilter: "all" | tunnelId`. La plateforme **n'est plus un filtre** ; elle reste visible via l'**icône plateforme** de chaque ligne (déjà présente).

### 4.2 Sections de groupe + bilan de statuts

- Le Hub reste **groupé par tunnel** (sections dans l'ordre `tunnel.order`). Quand `groupFilter !== "all"`, seule la section du groupe sélectionné s'affiche.
- **En-tête de groupe** (`otl-tunnel-group__title` enrichi) : **pastille couleur**, **nom**, **compteur** (`otl-tunnel-group__count`), et **bilan de statuts** dérivé des `lastRun.status` des scénarios du groupe :
  - Format : segments non-nuls joints par « · », ex. **« 3 réussis · 1 échec »**, **« 2 jamais exécutés »**, **« 1 réussi · 1 échec · 1 jamais exécuté »**.
  - Catégories : `passed` → « réussi(s) », `failed` → « échec(s) », `never` → « jamais exécuté(s) ». Accord singulier/pluriel.
  - (L'état « en cours » est lié à l'auto-run / runs live → **Phase C** ; pas de bilan « en cours » en Phase B.)
  - Bouton **« Éditer »** discret dans l'en-tête → `/scenarios/groups/:tunnelId/edit`.

### 4.3 Ligne de scénario (métas enrichies)

- **Icône plateforme** (gauche, inchangée).
- **Nom** (inchangé).
- **Méta** (`otl-card__meta`) : **« <PlateformeLabel> · <Navigateur> · N étapes »**, ex. « Web · Firefox · 11 étapes ». N = `scenario.lastRun.stepCount`. **Si `stepCount` est absent, le segment étapes est omis** (affiche « Web · Firefox ») — pas de « — étapes ».
  - **Navigateur affiché fidèlement** (`chromium`→« Chromium », `firefox`→« Firefox », `webkit`→« WebKit »). L'**exécution réelle reste Chromium** (multi-navigateurs = hors périmètre).
- **Droite** : badge de statut (inchangé) + **temps relatif** (remplace la date absolue) + **durée** (mono, inchangée) + bouton **Lancer ▶**.
  - **Temps relatif** : helper `formatRelative(at)` → « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 3 j », puis date absolue au-delà de ~7 j. « — » si jamais exécuté.

### 4.4 Helpers de formatage (extraction testable)

- Créer `src/renderer/lib/time.ts` exportant `formatRelative(at?: string): string`, `formatDuration(ms?: number): string`, `formatAt(at?: string): string` (déplacés depuis `HubLibrary.tsx` pour être testables unitairement). `HubLibrary` les importe.
- `formatRelative` est **déterministe par rapport à `Date.now()`** ; les tests injectent un `now` via un second paramètre optionnel `formatRelative(at, now?)` pour éviter la dépendance à l'horloge.

## 5. Créer / éditer un groupe (écran dédié)

### 5.1 `/scenarios/groups/new` — `NewGroupe.tsx`

- Fil d'Ariane `← Scénarios / Nouveau groupe`. Sous-titre « Un groupe rassemble des scénarios d'un même parcours (ex. tunnel de vente). »
- Champs : **NOM DU GROUPE** (obligatoire), **COULEUR** (palette de pastilles, §2.1, défaut = 1ʳᵉ), **DESCRIPTION — optionnel** (textarea).
- **APERÇU** : une carte de groupe en direct (pastille couleur + nom saisi + « 0 · vide pour l'instant »).
- **GROUPES EXISTANTS** : liste en lecture seule des groupes du projet (pastille + nom + compteur).
- Actions : **« Créer le groupe »** (désactivé si nom vide) → `createTunnel({ projectId: activeProjectId, name, color, description })` → retour `/scenarios`. **« Annuler »** → `/scenarios`.

### 5.2 `/scenarios/groups/:tunnelId/edit` — `EditGroupe.tsx`

- Même structure que `NewGroupe`, pré-rempli depuis le tunnel chargé (`listTunnels` filtré, ou un `getTunnel` via un nouvel appel — on réutilise `listTunnels(activeProjectId)` puis `.find`).
- Champs éditables : nom, couleur, description. Actions : **« Enregistrer les modifications »** → `updateTunnel({ ...tunnel, name, color, description })` → retour `/scenarios`. **« Annuler »**.
- **Supprimer** : bouton destructif (`otl-btn-stop`) → `deleteTunnel(projectId, tunnelId)` → retour `/scenarios`. **Désactivé** si c'est le dernier groupe **ou** si le groupe contient des scénarios (la garde existe déjà côté main ; l'UI reflète via `disabled` + tooltip « Déplacez ou supprimez d'abord ses scénarios »). On calcule « contient des scénarios » depuis les scénarios chargés du projet.

### 5.3 Accès

- Le `+` des onglets du Hub et un éventuel bouton « Nouveau groupe » → `/scenarios/groups/new`.
- Le bouton « Éditer » d'un en-tête de groupe → `/scenarios/groups/:tunnelId/edit`.

## 6. Cohérence visuelle & cleanup

- Réutiliser les tokens/`otl-*` existants (`otl-tab`, `otl-card*`, `otl-badge*`, `otl-tunnel-group*`, `otl-screen`, `otl-breadcrumb*`, `otl-create*`, `otl-field-label`, `otl-input`, `otl-btn-primary`, `otl-btn-stop`). Nouvelles règles `theme.css` au besoin : pastille couleur de groupe (`otl-group-dot`), palette de sélection (`otl-color-swatch*`), bilan de statuts (`otl-group-stats`), aperçu de groupe.
- Retirer le code mort du filtre plateforme et de la création inline de tunnel (« + Tunnel » actuel) remplacée par le `+` des onglets / l'écran dédié.

## 7. Hors périmètre (Phase B)

- **Auto-run** et états **« Nouveau » / « 1ʳᵉ exécution… » / « en cours »** → **Phase C**.
- **Réassignation** d'un scénario à un autre groupe (drag/déplacement) → itération séparée.
- **Multi-navigateurs réels** (Edge/Firefox à l'exécution) → affichage seulement.
- **Réordonnancement** des groupes (changer `order`) → non couvert.
- Mobile réel, IA → placeholders désactivés (inchangé).

## 8. Impacts techniques (synthèse)

- **Types** (`src/shared/types.ts`) : `Tunnel` + `color`/`description` ; `LastRun` + `stepCount?`.
- **Main** : `tunnelStore` (`listTunnels`/`getTunnel` rétro-remplissent ; `saveTunnel` inchangé) ; `handlers.ts` (`handleCreateTunnel` payload étendu, `handleUpdateTunnel` nouveau) ; `register.ts` (`tunnel:update`) ; `playwrightRunner.ts` (`updateLastRun` reçoit `stepCount: report.steps.length`) ; `scenarioStore.updateLastRun` accepte `stepCount`.
- **Preload + api.d.ts** : `createTunnel` payload étendu, `updateTunnel(t): Promise<Tunnel>`.
- **Renderer** : `HubLibrary.tsx` (filtre groupe, bilans, métas, temps relatif, accès édition) ; `NewGroupe.tsx` + `EditGroupe.tsx` (nouveaux) ; `App.tsx` (2 routes) ; `src/renderer/lib/time.ts` (helpers extraits) ; `theme.css`.
- **Dérivés** : bilan de statuts par groupe (agrégation `lastRun.status`) ; temps relatif (`formatRelative`) ; nb d'étapes via `lastRun.stepCount`.

## 9. Critères d'acceptation & vérification « en tant qu'utilisateur »

En plus de `npm test` + build verts (3 OS) et lint Biome propre :

1. **E2E Playwright `_electron`** ajouté à la suite : ouvrir le Hub d'un projet → **créer un groupe** « Réservation » avec une couleur → il apparaît dans les **onglets** (avec pastille) et comme **section** avec sa couleur en en-tête → cliquer l'onglet du groupe filtre les scénarios → **éditer** le groupe (changer la description) et vérifier la persistance → (cas garde) la **suppression** d'un groupe non vide est refusée/désactivée.
2. **Unitaires** : `formatRelative` (« il y a 5 min », « hier », « il y a 3 j », « à l'instant », date au-delà de 7 j) avec `now` injecté ; bilan de statuts (accord singulier/pluriel, segments non-nuls) ; rétro-remplissage `color`/`description` dans `listTunnels` ; `handleUpdateTunnel` préserve `id`/`order`/`createdAt` ; `handleCreateTunnel` applique les défauts couleur/description ; `updateLastRun` persiste `stepCount`.
3. **Démo réelle** : lancer l'app, dérouler **créer un groupe coloré → y voir un scénario avec navigateur · étapes · temps relatif → bilan de groupe → éditer/supprimer**, et **partager des captures** pour valider la cohérence visuelle avec la maquette.
4. **Non-régression** : les scénarios restent groupés, le lancement (précédence d'environnement) et l'enregistrement fonctionnent ; les tests Hub/filtres existants sont mis à jour (filtre plateforme → filtre groupe).

## 10. Points par défaut retenus (à confirmer en revue)

1. **Étendue** = créer + éditer + supprimer (confirmé).
2. **Nb d'étapes** persisté sur `lastRun.stepCount` (rempli au run), pas de relecture du rapport ; « — » si absent.
3. **Couleur** : palette fixe de 8 pastilles ; défaut/migration `#2f6bff`.
4. **Temps relatif** : helper dédié, bascule en date absolue au-delà de ~7 jours ; `now` injectable pour les tests.
5. **Bilan « en cours »** reporté en Phase C (lié à l'auto-run).
6. **Séquence** : Phase B en une PR, mergée après CI verte (gate côté loop, pas de `--auto`).
