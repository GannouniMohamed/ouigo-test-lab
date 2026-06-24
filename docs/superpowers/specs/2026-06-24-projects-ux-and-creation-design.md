# UX Projets : navigation « projet d'abord », création avec environnements, cohérence visuelle — Design

> Statut : validé (brainstorming). Prochaine étape : plan d'implémentation (writing-plans).
> Date : 2026-06-24

## 1. Problème

L'écran Projets actuel a deux défauts bloquants et un défaut esthétique :

1. **Création incomplète** : `createProject({name, description})` crée d'office des environnements `Préprod`/`Recette` avec des URLs factices (`https://preprod.ouigo.example`), et **aucune URL réelle ne peut être saisie** — ni à la création, ni après (l'éditeur ne permet qu'ajouter/supprimer, **pas modifier** une URL existante). Un projet n'est donc pas utilisable sans contourner l'outil.
2. **Navigation** : l'app démarre sur le Hub (`/scenarios`), pas sur les projets. L'utilisateur veut « le projet d'abord, puis les scénarios ».
3. **Esthétique** : l'écran Projets jure avec le reste du design (formulaire en ligne brut, pas de cartes glassmorphiques, pas de labels, espacements incohérents).

## 2. Navigation « projet d'abord »

- **Route par défaut** : `/` redirige vers `/projects` (au lieu de `/scenarios`).
- **Accueil = liste des projets** : cartes affichant **nom**, **description**, **nombre d'environnements** et **nombre de scénarios**. Bouton **« + Nouveau projet »**. Actions par carte : **Ouvrir** (entrer dans le projet), **Environnements** (éditer ses environnements), **Supprimer** (désactivée s'il ne reste qu'un projet).
- **Entrer dans un projet** : cliquer **Ouvrir** (ou la carte) appelle `setActiveProjectId(id)` puis navigue vers `/scenarios` (le Hub existant groupé par tunnel, scopé au projet actif).
- **Hub** : affiche le **nom du projet actif** en en-tête + un retour **« ← Projets »** (navigue vers `/projects`).
- **Sidebar réordonnée** : **Projets** (1er, actif sur `/projects`), **Scénarios** (du projet actif), **Exéc.**, **Rapports**, **IA** (désactivé). L'icône Projets reste celle ajoutée précédemment.
- Le **bandeau switcher** de projet en haut est conservé pour changer rapidement de projet sans repasser par l'accueil.

## 3. Création de projet avec environnements

### 3.1 Formulaire de création

Déclenché par **« + Nouveau projet »** : un **panneau inline** s'ouvre en haut de l'écran Projets (toggle, comme le « + Tunnel » du Hub) — pas de route séparée. Champs :

- **Nom du projet** (obligatoire).
- **Description** (optionnelle).
- **Environnements** : une **liste de lignes éditables**, chaque ligne = **libellé** + **URL**. Pré-remplie avec **deux lignes de départ** : `Préprod` et `Recette` (libellés modifiables, URLs vides à saisir). Bouton **« + ajouter un environnement »** et **suppression par ligne**.

### 3.2 Règles de validation

- Au moins **un** environnement.
- Chaque ligne conservée doit avoir un **libellé non vide** et une **URL non vide** commençant par `http://` ou `https://`. Une ligne dont libellé ET URL sont vides est ignorée silencieusement à la soumission ; une ligne partiellement remplie (ou URL invalide) bloque la soumission avec un indice inline.
- Le bouton **« Créer le projet »** est désactivé tant que le nom est vide ou qu'aucun environnement valide n'est présent.

### 3.3 Comportement après création

- Le handler construit les `Environment` à partir des lignes : `id` dérivé du libellé (slugifié, **unique dans le projet**), `label`, `baseURL`, `variables: {}`. Ces environnements **remplacent** les défauts `.example` (qui ne sont plus injectés pour les projets créés par l'utilisateur).
- Le tunnel **« Général »** est créé automatiquement comme aujourd'hui (`createProject` reste atomique).
- Le nouveau projet **devient actif** et l'app navigue dans son Hub (vide → état « créez votre premier scénario »).

### 3.4 Édition des environnements (correctif du bug)

- L'éditeur d'environnements (accessible depuis l'action **Environnements** d'une carte projet) permet désormais l'**édition en place du libellé et de l'URL** d'un environnement existant, en plus d'ajouter/supprimer.
- L'édition met à jour l'environnement **sans régénérer son `id`** (on édite `label`/`baseURL` sur l'`id` existant). Conséquence directe : les environnements `preprod`/`recette` du « Projet par défaut » (créés par seed/migration avec des URLs `.example`) deviennent enfin **corrigeables**.
- Suppression toujours refusée sur le **dernier** environnement (garde déjà présente côté main + reflétée dans l'UI).

## 4. Cohérence visuelle

L'écran Projets et le formulaire de création doivent réutiliser le **langage visuel existant** (mêmes tokens `theme.css`, mêmes composants), au même niveau de finition que le Hub et New Scenario :

- **Cartes projet** : `otl-card` glassmorphique (comme les cartes de scénario), avec nom (`otl-card__name`), méta (`otl-card__meta`) et cluster d'actions à droite (`otl-card__right`). Compteurs « N env · M scénarios ».
- **Titres** : `otl-hub-title` / `otl-hub-subtitle`.
- **Champs** : chaque champ a un `otl-field-label` (uppercase, 10.5px, `--otl-text-2`) au-dessus d'un `otl-input` (hauteur 40px, focus cyan), comme New Scenario.
- **Lignes d'environnement** : présentées comme une mini-table soignée (libellé + URL alignés, bouton de suppression discret), dans un bloc encadré cohérent (réutiliser le style des blocs `otl-method`/`otl-env-editor`).
- **Boutons** : primaire en dégradé (`otl-btn-primary`), destructif (`otl-btn-stop`), secondaire/onglet (`otl-tab`). Pas de bouton brut.
- **Espacements** : colonne max-width ~640px pour le formulaire, gaps cohérents (≈18px) comme New Scenario.
- Aucune régression sur le bandeau switcher (déjà nettoyé de l'EnvPicker mort).

## 5. Modèle de données

**Inchangé.** `Project` porte déjà `environments: Environment[]` ; `Environment` a déjà `{ id, label, baseURL, variables }`. **Aucune migration.** Seule la **signature IPC de création** évolue (voir §6).

## 6. Impacts techniques

- **IPC** : `createProject` accepte désormais les environnements. Signature cible : `createProject(input: { name: string; description: string; environments: Array<{ label: string; baseURL: string }> }): Promise<Project>`. Le handler dérive les `id` (slugify + unicité intra-projet), crée le projet + le tunnel « Général ». Mise à jour de `preload` et `api.d.ts`. (Pas de nouveau canal pour l'édition : l'édition d'environnement réutilise `saveEnvironment(projectId, env)`, déjà en place — upsert par `id`.)
- **Renderer** :
  - `App.tsx` : route par défaut `/` → `/projects`.
  - `Sidebar.tsx` : « Projets » en premier, ordre mis à jour.
  - `Projects.tsx` : refonte — liste de cartes projet (avec compteur de scénarios), formulaire de création avec lignes d'environnement, éditeur d'environnements **éditable**. Réutilise les classes existantes + nouvelles règles `theme.css` au besoin.
  - `HubLibrary.tsx` : en-tête « projet actif » + retour « ← Projets ».
  - `theme.css` : styles de la mini-table d'environnements et du panneau de création, alignés sur les tokens existants.
- **Compteur de scénarios par projet** : la carte projet affiche `listScenariosByProject(projectId).length`. Pour éviter N appels, l'écran Projets peut charger les scénarios par projet à l'affichage (acceptable au volume attendu) ; détail laissé au plan.

## 7. Hors périmètre

- UI des **variables** d'environnement (restent `{}`).
- Validation d'URL poussée (au-delà du préfixe `http(s)://` + non-vide).
- Assistant de création multi-étapes (on garde le **formulaire unique**).
- Renommer/déplacer des scénarios entre tunnels ; lancement groupé ; exécution responsive/mobile réelle (itérations séparées déjà actées).

## 8. Critères d'acceptation & vérification « en tant qu'utilisateur »

La fonctionnalité n'est **terminée** que lorsque le parcours complet est démontré, fonctionnel **et** visuellement cohérent :

1. **Test E2E Playwright `_electron`** (ajouté à la suite e2e existante, codegen stubbé via `OTL_CODEGEN`) couvrant : ouvrir l'app sur la liste des projets → **créer un projet** « Démo » avec deux environnements (libellés + URLs réels) → vérifier qu'il apparaît avec « 2 env » et devient actif → **créer un tunnel** « Réservation » dans ce projet → **créer un scénario** rattaché au tunnel « Réservation » (flux d'enregistrement avec codegen factice) → vérifier que le scénario apparaît **sous le bon tunnel** dans le Hub du projet.
2. **Édition d'environnement** : un test (E2E ou renderer) vérifie qu'éditer l'URL d'un environnement existant la met à jour (correctif du bug).
3. **Démo réelle** : lancer l'app, dérouler le parcours du point 1 à la main, et **partager des captures** à l'utilisateur pour valider la **cohérence visuelle** (cartes, formulaire, en-tête projet) avant clôture.
4. **Non-régression** : toute la suite (`npm test`) et le build restent verts sur les 3 OS via la CI.
