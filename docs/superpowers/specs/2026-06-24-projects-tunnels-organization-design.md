# Organisation Projet → Tunnel → Scénario — Design

> Statut : validé (brainstorming). Prochaine étape : plan d'implémentation (writing-plans).
> Date : 2026-06-24

## 1. Objectif

Donner aux P.O. et testeurs une **répertorisation** claire de leurs tests :

- **Projet** : un périmètre métier (ex. « Ouigo.com », « App voyageurs »). Porte ses **propres environnements**.
- **Tunnel** : un regroupement de parcours dans un projet (ex. « Réservation », « Compte client »). Indépendant de la plateforme.
- **Scénario** : un parcours de test exécutable. Porte la **plateforme** (`web` | `responsive` | `mobile`).

La navigation repose sur un **switcher de projet** dans le header et un **Hub où les scénarios sont groupés par tunnel** (sections repliables). Un **écran « Projets »** gère projets et environnements.

Cette itération corrige aussi l'**icône de plateforme** des scénarios pour qu'elle soit ISO maquette (web = globe, responsive = écran, mobile = téléphone).

### Hors périmètre de cette itération

- **Lancement groupé / campagnes** (lancer tout un tunnel ou tout un projet, rapport consolidé). Reporté à l'itération suivante. L'exécution reste **par scénario**.
- **Exécution mobile réelle** (Maestro). La plateforme `mobile` reste sélectionnable mais non exécutable (déjà le cas).
- **Exécution responsive réelle.** La plateforme `responsive` est stockée et affichée ; son moteur (viewport mobile Playwright) sera branché quand on fera le runner responsive. À l'exécution, un scénario `responsive` se comporte aujourd'hui comme un `web` (même runner Playwright).

## 2. Modèle de données

### 2.1 Types (`src/shared/types.ts`)

`Platform` passe de `"web" | "mobile"` à :

```ts
export type Platform = "web" | "responsive" | "mobile";
```

Nouveaux types :

```ts
export interface Project {
	id: string;
	name: string;
	description: string;
	environments: Environment[];
	createdAt: string;
}

export interface Tunnel {
	id: string;
	projectId: string;
	name: string;
	order: number; // ordre d'affichage dans le Hub
	createdAt: string;
}
```

`Scenario` gagne un rattachement au tunnel (et donc, transitivement, au projet) :

```ts
export interface Scenario {
	id: string;
	projectId: string; // NOUVEAU
	tunnelId: string; // NOUVEAU
	name: string;
	platform: Platform;
	browser: "chromium" | "firefox" | "webkit";
	defaultEnvironmentId: string;
	tags: string[];
	specFile: string;
	createdAt: string;
	lastRun: LastRun;
}
```

`Environment` est inchangé en forme, mais **n'est plus global** : il vit désormais dans `Project.environments` (voir §3). Les autres types (`Report`, `ReportStep`, `RunEvent`, etc.) sont inchangés.

### 2.2 Invariants du modèle

- Tout projet possède **au moins un tunnel** nommé « Général » (créé à la création du projet). Zéro friction : on peut créer un scénario sans créer de tunnel d'abord.
- Tout projet possède **au moins un environnement**. À la création d'un projet, on seed les environnements par défaut (Préprod, Recette) + un environnement « Local » (pour les fixtures de dev/seed).
- Un scénario appartient à exactement un tunnel ; `scenario.projectId` est toujours cohérent avec `tunnel.projectId`.
- `scenario.defaultEnvironmentId` référence un environnement **du projet du scénario**.

## 3. Stockage (workspace)

Aujourd'hui (plat) :

```
<workspace>/
  scenarios/<scenarioId>/{scenario.meta.json, <specFile>}
  environments.json            (global)
  runs/<runId>/report.json
```

Cible (imbriqué) :

```
<workspace>/
  projects/
    <projectId>/
      project.json             ({ id, name, description, environments[], createdAt })
      tunnels/
        <tunnelId>/
          tunnel.json          ({ id, projectId, name, order, createdAt })
          scenarios/
            <scenarioId>/
              scenario.meta.json
              <specFile>
  runs/<runId>/report.json     (INCHANGÉ — les rapports restent indexés par runId)
```

Décisions de stockage :

- **Les rapports restent dans `runs/<runId>/`**, indexés par `runId` seul. `Report` contient déjà `scenarioId` ; on n'ajoute pas `projectId`/`tunnelId` au rapport (YAGNI pour cette itération : l'historique reste filtrable par scénario, comme aujourd'hui).
- `project.json` **contient** ses environnements (pas de fichier séparé) — un projet est une unité autonome, facile à lire/écrire d'un bloc.
- L'arborescence imbriquée encode le rattachement dans les chemins, donc lister les scénarios d'un tunnel = lire un dossier ; pas d'index transverse à maintenir.

## 4. Migration

Au démarrage (`ensureWorkspace` / une étape de migration appelée depuis `src/main/index.ts` avant `seedIfEmpty`), si l'ancien layout est détecté **et** que `projects/` n'existe pas encore :

1. Créer un projet **« Projet par défaut »** (`id: "default"`).
2. Ses `environments` = contenu de l'ancien `environments.json` s'il existe (sinon les défauts Préprod/Recette). L'environnement « Local » est conservé/ajouté.
3. Créer dans ce projet un tunnel **« Général »** (`id: "general"`, `order: 0`).
4. Déplacer chaque `scenarios/<id>/` existant vers `projects/default/tunnels/general/scenarios/<id>/`, en mettant à jour `scenario.meta.json` : ajouter `projectId: "default"`, `tunnelId: "general"`, et normaliser `platform` (toute valeur inconnue → `"web"`).
5. Supprimer (ou laisser orphelins, mais préférablement supprimer) l'ancien `scenarios/` et `environments.json` après migration réussie.

La migration est **idempotente** : si `projects/` existe déjà, elle ne fait rien. Elle est testée par un test dédié (workspace temporaire pré-rempli à l'ancien format → assert layout cible + données préservées).

Le **seed** (`seedIfEmpty`) est adapté : si aucun projet n'existe, créer « Projet par défaut » + tunnel « Général », y copier les seed-scenarios (passing/failing) en leur affectant `projectId`/`tunnelId`, et y attacher l'environnement « Local ».

## 5. Couche main (stores + IPC)

### 5.1 Stores

Nouveau `src/main/stores/projectStore.ts` :

- `listProjects(): Project[]`
- `getProject(id): Project`
- `saveProject(p: Project): void` (crée/met à jour `project.json`)
- `deleteProject(id): void` (supprime le dossier projet entier ; refus si c'est le dernier projet — il doit toujours en rester un)
- Helpers environnements scopés projet : `listEnvironments(projectId)`, `getEnvironment(projectId, envId)`, `saveEnvironment(projectId, env)` — opèrent sur `project.environments`.

Nouveau `src/main/stores/tunnelStore.ts` :

- `listTunnels(projectId): Tunnel[]` (triés par `order`)
- `getTunnel(projectId, tunnelId): Tunnel`
- `saveTunnel(t: Tunnel): void`
- `deleteTunnel(projectId, tunnelId): void` — **refusé dans deux cas** (erreur explicite, aucune suppression) : (a) c'est le dernier tunnel du projet ; (b) le tunnel contient encore des scénarios. L'utilisateur doit donc vider ou déplacer les scénarios avant de supprimer un tunnel. (Le déplacement de scénarios entre tunnels n'est pas requis cette itération ; supprimer les scénarios un par un suffit.)

`src/main/stores/scenarioStore.ts` devient **scopé par tunnel** :

- `listScenarios(projectId, tunnelId): Scenario[]`
- `listScenariosByProject(projectId): Scenario[]` (parcourt tous les tunnels — utilisé par le Hub)
- `getScenario(projectId, tunnelId, id): Scenario`
- `saveScenario(s: Scenario, specContent): void` (chemin dérivé de `s.projectId`/`s.tunnelId`)
- `deleteScenario(projectId, tunnelId, id): void`
- `updateLastRun(projectId, tunnelId, id, lastRun): void`

`src/main/stores/environmentStore.ts` global est **supprimé** (sa logique de défauts migre dans `projectStore` / migration).

> Décision : `getScenario` exige le triplet `(projectId, tunnelId, id)`. L'exécution part toujours du Hub, qui connaît déjà projet + tunnel ; on évite un scan global. (Si un appel ne connaît que `id`, il passe par `listScenariosByProject` du projet actif.)

### 5.2 IPC (`register.ts` + `handlers.ts` + `preload` + `api.d.ts`)

Nouveaux canaux / méthodes (noms `window.api.*`) :

```ts
// Projets
listProjects(): Promise<Project[]>;
getProject(id: string): Promise<Project>;
createProject(input: { name: string; description: string }): Promise<Project>;
updateProject(p: Project): Promise<void>;
deleteProject(id: string): Promise<void>;

// Environnements (scopés projet)
listEnvironments(projectId: string): Promise<Environment[]>;
saveEnvironment(projectId: string, env: Environment): Promise<void>;

// Tunnels
listTunnels(projectId: string): Promise<Tunnel[]>;
createTunnel(input: { projectId: string; name: string }): Promise<Tunnel>;
deleteTunnel(projectId: string, tunnelId: string): Promise<void>;

// Scénarios (scopés)
listScenariosByProject(projectId: string): Promise<Scenario[]>;
runScenario(projectId: string, tunnelId: string, scenarioId: string, envId: string): Promise<{ runId: string }>;
deleteScenario(projectId: string, tunnelId: string, scenarioId: string): Promise<void>;
```

`startRecording` gagne `projectId` et `tunnelId` dans ses options ; le scénario produit est rangé dans le bon tunnel.

`scenario:run` (handler) résout désormais l'environnement via `getEnvironment(projectId, envId)` au lieu du store global.

> Décision : `createProject` crée atomiquement le projet **avec** son tunnel « Général » et ses environnements par défaut, pour garantir les invariants du §2.2 sans aller-retour côté renderer.

## 6. Couche renderer (UX)

### 6.1 État global (`src/renderer/store.ts`, Zustand)

Ajout d'un `activeProjectId` (et la liste `projects`). Persisté dans `localStorage` pour retrouver le projet courant au relancement. Au boot : charger `projects`, choisir `activeProjectId` (dernier utilisé si valide, sinon le premier projet). L'`EnvPicker` lit les environnements du projet actif.

### 6.2 Switcher de projet (header / TitleBar zone ou bandeau sous la TitleBar)

- Un sélecteur (style `otl-select`) listant les projets ; changer de projet met à jour `activeProjectId`, recharge tunnels + scénarios + environnements.
- Une entrée « Gérer les projets… » qui navigue vers l'écran Projets.

> Décision d'emplacement : le switcher vit dans un **bandeau de contexte** juste sous la TitleBar (pas dans la barre de titre draggable, pour ne pas gêner le drag et rester ISO sur macOS/Windows). Il affiche : nom du projet (switcher) à gauche, `EnvPicker` à droite.

### 6.3 Hub « Scénarios » (`HubLibrary.tsx`)

- Charge `listScenariosByProject(activeProjectId)` + `listTunnels(activeProjectId)`.
- Affiche les scénarios **groupés par tunnel** : une section repliable par tunnel, titre = nom du tunnel + compteur, contenu = les lignes scénario existantes (icône plateforme, nom, `StatusBadge`, durée, bouton **Lancer**).
- Boutons d'en-tête : **« + Nouveau scénario »** (ouvre la création, voir §6.5) et **« + Tunnel »** (modale/inline pour nommer un tunnel).
- La recherche et le filtre plateforme existants restent, et filtrent à l'intérieur des groupes (un groupe sans résultat est masqué). Le filtre plateforme gagne l'option `responsive`.
- **Lancer** appelle `runScenario(projectId, tunnelId, scenarioId, env)` puis navigue vers `/run/:runId`.

### 6.4 Icônes de plateforme (ISO maquette)

Trois icônes 16px (et 30px sur l'écran New Scenario) :

- `web` = **globe** : cercle + méridien unique `d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"` (corrige l'icône actuelle qui ajoute une ligne horizontale).
- `responsive` = **écran/moniteur** : rectangle + pied.
- `mobile` = **téléphone** : rectangle arrondi vertical + bouton.

Extraites dans un petit module partagé `src/renderer/components/PlatformIcon.tsx` (`<PlatformIcon platform size />`) réutilisé par le Hub et New Scenario.

### 6.5 Création de scénario (`NewScenario.tsx`)

- Ajout d'un sélecteur **Tunnel** (destination), pré-rempli sur « Général » ou le tunnel courant. Possibilité de créer un nouveau tunnel à la volée n'est **pas** requise ici (utiliser « + Tunnel » du Hub) — YAGNI.
- Le sélecteur de plateforme gagne **Responsive** (carte sélectionnable, runner = web pour l'instant). `mobile` reste « bientôt ».
- `startRecording` reçoit `projectId` (actif) + `tunnelId` (choisi) ; le scénario est rangé dans le bon tunnel.

### 6.6 Écran « Projets » (`src/renderer/screens/Projects.tsx`, route `/projects`)

- Liste des projets (nom, description, nb de tunnels/scénarios).
- Créer un projet (nom + description) → `createProject`.
- Éditer un projet : renommer, éditer la description, **gérer ses environnements** (ajouter/modifier/supprimer : label, baseURL, variables).
- Supprimer un projet (confirmation ; bloqué s'il ne reste qu'un projet).
- Item sidebar « Projets » ajouté (`Sidebar.tsx`), + entrée « Gérer les projets » du switcher pointant ici.

### 6.7 Titres de page (`TitleBar.tsx` `pageTitle`)

Ajouter `/projects` → « Projets ». Les autres titres inchangés.

## 7. Tests

- **Migration** : test unitaire dédié (ancien layout → cible, données préservées, idempotence).
- **projectStore / tunnelStore / scenarioStore** : CRUD scopé, invariants (dernier projet/tunnel non supprimable, tunnel non vide non supprimable, seed des défauts).
- **Environnements scopés projet** : `getEnvironment(projectId, envId)`.
- **Renderer** : le Hub groupe par tunnel (rend les titres de tunnels + scénarios sous le bon groupe) ; le switcher change le projet actif ; New Scenario envoie `projectId`/`tunnelId` à `startRecording` ; écran Projets crée/édite un projet et ses environnements.
- Préserver les tests existants en adaptant leurs appels API aux nouvelles signatures (run/scenario/env scopés). Les contrats UI (placeholders, libellés, `data-testid`) restent autant que possible.

## 8. Découpage pressenti (pour le plan)

1. Types + migration + stores main (project/tunnel/scenario scopés, env par projet) + seed.
2. IPC + preload + `api.d.ts` (toutes les nouvelles méthodes) + handler `scenario:run` scopé.
3. Store renderer (`activeProjectId`, `projects`) + bandeau switcher + `EnvPicker` scopé.
4. Hub groupé par tunnel + `PlatformIcon` (icônes ISO maquette) + filtre `responsive`.
5. New Scenario (sélecteur tunnel + plateforme responsive).
6. Écran Projets (CRUD projets + environnements) + item sidebar + titres.

Le lancement groupé (campagnes) et l'exécution responsive/mobile réelle feront l'objet d'itérations séparées (spec + plan dédiés).
