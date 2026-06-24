# Alignement maquette « Ouigo Test Lab » — Projets, Hub/Groupes, Auto-run — Design

> Statut : brainstorming, en attente de revue utilisateur.
> Date : 2026-06-24.
> **Supersède** `2026-06-24-projects-ux-and-creation-design.md` (le périmètre s'élargit pour matcher la maquette Claude Design à jour).
> Source de vérité visuelle : maquette « Ouigo Test Lab » (Claude Design, version `-print-1rbhcrv`), sections 01→06.

## 1. Objectif

Rendre l'app **fidèle à la maquette** : refonte de la zone Projets, navigation « projet d'abord », Hub enrichi avec des **groupes** (tunnels) colorés, et **auto-run** d'un scénario fraîchement créé. Le tout dans le langage visuel existant (sombre, glassmorphique, dégradé cyan→bleu).

Découpage en **3 phases livrables** (chacune : spec de cette section → plan → loop → PR mergée après CI verte) :
- **Phase A — Projets & navigation**
- **Phase B — Hub & Groupes**
- **Phase C — Auto-run**

## 2. Terminologie & modèle

- **Groupe** = l'entité aujourd'hui nommée **Tunnel** dans le code. L'UI affiche désormais **« Groupe »** (« groupe de parcours ») ; on **garde l'entité `tunnel`** côté code (id, fichiers) pour éviter une migration, et on **relibelle dans l'UI**. Les noms de groupes restent libres (« Tunnel de vente », etc.).
- **Modèle étendu (Phase B)** : `Tunnel` gagne `color: string` (hex) et `description: string`. Migration douce : les tunnels existants reçoivent une couleur par défaut et une description vide (rétro-compatible, pas de fichier à déplacer).
- **Environnement actif (Phase A)** : le bandeau porte l'environnement actif **par projet**. Le store renderer gagne `activeEnvByProject: Record<projectId, envId>` (persisté localStorage). C'est l'environnement utilisé au **lancement** d'un scénario.
- Le reste du modèle (Projet porte ses `environments`, Scénario porte `platform`/`browser`/`tunnelId`) est **inchangé**.

## 3. Bandeau de contexte (transverse, Phase A)

Sous la barre de titre, sur les écrans scopés projet : une **barre de contexte** =
- **Fil d'Ariane** : `Projets / <NomProjet> ⌄` — le nom du projet est un **dropdown de switch de projet** (remplace le switcher actuel). Sur les sous-écrans : `Projets / Ouigo.com / Environnements`, etc.
- À droite : **« Environnement `<Préprod> ⌄` »** — sélecteur de l'**environnement actif** du projet (la liste vient de `project.environments`). Réintroduit le picker retiré précédemment, mais cette fois **câblé** : il fixe `activeEnvByProject[projectId]` et c'est lui qui est passé à `runScenario`.

## 4. Phase A — Projets & navigation

### 4.1 Accueil = liste des projets
- **Route par défaut** : `/` → `/projects`. Sidebar : **Projets** en premier (Projets, Scénarios, Exéc., Rapports, IA).
- **Cartes projet** (glassmorphiques, style `otl-card`) : icône, **nom**, **description**, deux pills **« N environnements »** et **« M scénarios »**, actions **« Ouvrir › »** (dégradé) et **« Environnements »** (secondaire), + une petite icône **Supprimer** (désactivée s'il ne reste qu'un projet).
- **Ouvrir** : `setActiveProjectId(id)` + navigation `/scenarios` (Hub scopé au projet).
- **État vide** : illustration dossier + « Aucun projet pour l'instant » + sous-texte « Créez votre premier projet, ajoutez ses environnements (Préprod, Recette…) puis enregistrez vos scénarios de test. » + bouton **« Créer mon premier projet »**.
- **Compteur de scénarios** : `listScenariosByProject(projectId).length` (chargé à l'affichage de la liste).

### 4.2 Créer un projet (écran dédié `/projects/new`)
- Fil d'Ariane `← Projets / Nouveau projet`. Champs **NOM DU PROJET**, **DESCRIPTION** (textarea).
- Bloc **ENVIRONNEMENTS** : lignes **libellé + URL**, pré-remplies **Préprod** / **Recette** (URLs vides). **« + Ajouter un environnement »**, suppression par ligne.
- **Validation** par ligne : URL **requise** (« L'URL est requise pour cet environnement. ») et **valide** (« URL invalide — elle doit commencer par https:// » ; on accepte `http://` et `https://`). Compteur d'erreurs en tête (« 1 URL manquante »).
- **« Créer le projet »** désactivé tant que le nom est vide ou qu'une ligne est invalide ; **« Annuler »** revient à `/projects`. Footer d'aide « Renseignez une URL valide pour chaque environnement. »
- Création : `createProject({ name, description, environments: [{label, baseURL}] })` (IPC étendu, déjà acté), tunnel « Général » auto-créé, projet **devient actif**, navigation vers son Hub.

### 4.3 Éditer les environnements (écran dédié `/projects/:id/environments`)
- Fil d'Ariane `← Projets / <Projet> / Environnements`. Titre + « Modifiez le libellé et l'URL de chaque environnement du projet <Projet>. » + **« Ajouter »**.
- **Table** `LIBELLÉ | URL WEB`, **édition en place** du libellé ET de l'URL (état « En cours de modification »), suppression par ligne (bloquée sur le dernier). **« Enregistrer les modifications » / « Annuler »**. Réutilise `saveEnvironment(projectId, env)` (upsert par `id`, **id non régénéré** à l'édition) et `deleteEnvironment`.

### 4.4 Cohérence visuelle & cleanup
- Réutiliser tokens/`otl-*` (cartes, `otl-field-label`, `otl-input`, `otl-btn-primary`, `otl-btn-stop`, `otl-tab`), colonnes max-width ~640px, gaps cohérents.
- **Cleanup** : remplacer l'écran `Projects.tsx` actuel (formulaire inline « moche ») par les nouveaux écrans ; supprimer le code mort.

## 5. Phase B — Hub & Groupes

### 5.1 Hub enrichi
- Bandeau (cf. §3). En-tête « **Scénarios** / Organisés par groupe de parcours — aucun code à écrire. » + **« + Nouveau scénario »**.
- **Onglets de filtre = groupes** : « Tous · N », puis un onglet par groupe « <Groupe> · n », + un **`+`** pour créer un groupe inline. + champ **Rechercher…**. (Le filtre par plateforme actuel est remplacé par le filtre par groupe ; la plateforme reste visible via l'icône sur chaque ligne.)
- **En-tête de groupe** : pastille **couleur**, nom, compteur, et **bilan de statuts** (« 3 réussis · 1 en cours », « 1 réussi · 1 échec · 1 jamais exécuté ») agrégé depuis le `lastRun` des scénarios du groupe.
- **Ligne de scénario** : icône plateforme, nom, méta **« <Navigateur> · N étapes »** (ex. « Web · Firefox · 11 étapes »), badge de statut, **temps relatif** (« hier », « il y a 5 h », « il y a 3 j »), durée (mono), bouton Lancer (▶).
  - **Nombre d'étapes** : dérivé du **dernier rapport** du scénario ; « — » si jamais exécuté. (Choix retenu : pas de parsing du spec.)
  - **Navigateur** : on **affiche** le navigateur choisi (Chrome/Edge/Firefox/Chromium). L'**exécution réelle reste Chromium** pour l'instant (multi-navigateurs = chantier séparé).
  - **« 1ʳᵉ exécution… »** : un scénario jamais exécuté mais en cours de premier run affiche le badge « Nouveau » + « 1ʳᵉ exécution… » (lié à la Phase C).

### 5.2 Créer un groupe (écran dédié `/scenarios/groups/new`)
- Fil d'Ariane `Projets / <Projet> / Scénarios / Nouveau groupe`. « Un groupe rassemble des scénarios d'un même parcours (ex. tunnel de vente). »
- Champs **NOM DU GROUPE**, **COULEUR** (palette de pastilles), **DESCRIPTION — optionnel**.
- **APERÇU DANS LE HUB** : carte de groupe en direct (nom + couleur + « 0 · vide pour l'instant »).
- **GROUPES EXISTANTS** : liste des groupes du projet. **« Créer le groupe » / « Annuler »**.
- Le `+` des onglets du Hub ouvre ce même écran (ou un mini-formulaire) ; IPC `createTunnel({projectId, name, color, description})` étendu ; `updateTunnel` pour l'édition future.

## 6. Phase C — Auto-run

- À la **fin de la création** d'un scénario (arrêt de l'enregistrement), au lieu de revenir au Hub, on **lance automatiquement une exécution unique** : `stopRecording` → `runScenario(projectId, tunnelId, scenarioId, activeEnvId)` → navigation `/run/:runId`.
- L'écran **Live Run** affiche en mode auto : badge **« AUTO »**, bandeau « **Première exécution — validation automatique** — Le scénario que vous venez d'enregistrer est lancé une fois pour vérifier qu'il fonctionne. Aucune action requise. » Le reste (progression, étapes, aperçu) inchangé. À la fin → `/report/:runId` comme d'habitude.
- Dans le **Hub**, tant que ce premier run n'est pas terminé, le scénario porte le badge **« Nouveau »** + l'état **« 1ʳᵉ exécution… »** (pas de durée).
- **New Scenario** : champ **« Groupe »** (sélecteur de tunnel, relibellé), cartes plateforme **Mobile / Web Desktop / Web Responsive** ; **Mobile** et les blocs **IA** restent des **placeholders désactivés** fidèles à la maquette (pas d'exécution Maestro, pas d'IA).

## 7. Hors périmètre (réservé, placeholders fidèles)
- **Mobile réel** : exécution Maestro/Android, détection d'appareil USB (« APPAREIL CIBLE ») — **désactivé**.
- **IA** : description en langage naturel (V3), réparation automatique (V3) — **désactivés**.
- **Multi-navigateurs réels** (Edge/Firefox à l'exécution) — affichage seulement, exécution Chromium.
- Lancement groupé / campagnes (rapport consolidé) — itération séparée.

## 8. Impacts techniques (synthèse)
- **Types** : `Tunnel` + `color`, `description` (Phase B). Reste inchangé.
- **Main/IPC** : `createProject` accepte `environments` (Phase A) ; `createTunnel`/`updateTunnel` acceptent `color`/`description` (Phase B). Stores `tunnelStore` (color/desc), `projectStore` inchangé.
- **Renderer** : `App.tsx` (routes `/projects` défaut, `/projects/new`, `/projects/:id/environments`, `/scenarios/groups/new`) ; barre de contexte (breadcrumb + project dropdown + env picker) ; refonte `Projects.tsx` (liste, création, édition env) ; `HubLibrary.tsx` (filtres par groupe, bilans, métas, état 1ʳᵉ exécution) ; `NewScenario.tsx` (champ Groupe, auto-run) ; `store.ts` (`activeEnvByProject`) ; `theme.css`.
- **Dérivés** : nb d'étapes via dernier rapport ; temps relatif (helper de formatage) ; bilan de statuts par groupe (agrégation `lastRun`).

## 9. Critères d'acceptation & vérification « en tant qu'utilisateur »
Pour **chaque phase**, en plus de `npm test` + build verts (3 OS) :
- **Phase A** : E2E — ouvrir sur la liste des projets → **créer un projet** « Démo » avec 2 environnements (URLs valides) → il apparaît avec « 2 environnements » et devient actif → **éditer l'URL** d'un environnement et vérifier la mise à jour. Démo réelle + captures partagées.
- **Phase B** : E2E — **créer un groupe** « Réservation » (couleur) → il apparaît dans les onglets et en en-tête avec sa couleur → un scénario y est rangé et la méta (navigateur · étapes) + le bilan de groupe s'affichent.
- **Phase C** : E2E — créer un scénario (codegen factice) → **exécution auto unique** déclenchée → écran Live Run en mode AUTO → arrivée sur le Rapport ; pendant le run, l'état « 1ʳᵉ exécution… » est visible.
- **Démo réelle finale** : je lance l'app, je déroule **création projet+env → groupe → scénario auto-run**, et je t'envoie des captures pour valider la **cohérence visuelle** avec la maquette.

## 10. Points par défaut retenus (à confirmer en revue)
1. **Nb d'étapes** affiché = celui du **dernier rapport** (« — » si jamais exécuté), pas de parsing du spec.
2. **Navigateur** = **affiché** fidèlement, **exécution Chromium** (multi-navigateurs réels hors périmètre).
3. **Séquence** = **A → B → C** (3 PR successives), mergées après CI verte.
