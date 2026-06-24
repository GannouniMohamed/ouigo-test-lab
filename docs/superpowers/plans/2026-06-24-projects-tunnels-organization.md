# Organisation Projet → Tunnel → Scénario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire une répertorisation Projet → Tunnel → Scénario (environnements par projet, migration des données existantes, Hub groupé par tunnel, écran Projets, icônes plateforme ISO maquette).

**Architecture:** Trois couches Electron inchangées (main / preload / renderer). La couche de données passe d'un stockage plat (`scenarios/`, `environments.json` global) à un stockage imbriqué `projects/<pid>/tunnels/<tid>/scenarios/<sid>/`. Les environnements vivent dans `project.json`. Une étape de migration au démarrage convertit l'ancien layout. Le renderer gagne un projet actif (Zustand + localStorage), un bandeau switcher, et un Hub groupé par tunnel.

**Tech Stack:** Electron (electron-vite), React + TypeScript, React Router (HashRouter), Zustand, Vitest + @testing-library/react, Biome.

## Global Constraints

- `Platform` = `"web" | "responsive" | "mobile"` (ajout de `"responsive"`). Verbatim spec §2.1.
- Tout projet a **au moins un tunnel** (« Général », `id: "general"`) et **au moins un environnement**. Verbatim spec §2.2.
- `deleteProject` refusé s'il ne reste qu'un projet ; `deleteTunnel` refusé si c'est le dernier tunnel **ou** si le tunnel contient des scénarios ; `deleteProjectEnvironment` refusé si c'est le dernier environnement. Verbatim spec §5.1.
- Les **rapports restent dans `runs/<runId>/`**, indexés par `runId` seul (pas de `projectId`/`tunnelId` dans `Report`). Verbatim spec §3.
- Projet par défaut : `id: "default"`, nom « Projet par défaut ». Tunnel par défaut : `id: "general"`, nom « Général », `order: 0`. Verbatim spec §4.
- Environnements par défaut d'un nouveau projet : Préprod (`id: "preprod"`), Recette (`id: "recette"`), + Local (`id: "local"`, baseURL `file://…/index.html`). Verbatim spec §2.2 / §4.
- La migration est **idempotente** : si `projects/` existe, elle ne fait rien. Verbatim spec §4.
- L'exécution reste **par scénario** ; pas de lancement groupé cette itération. La plateforme `responsive` est stockée/affichée mais s'exécute comme `web` (même runner Playwright). Verbatim spec §1.
- Biome : tabs, LF. Après toute modif : `npx @biomejs/biome check --write <paths>` puis `npm run lint` doit être clean.
- Convention de test : workspace temporaire via `OTL_WORKSPACE`, nettoyé avec `Reflect.deleteProperty(process.env, "OTL_WORKSPACE")` (jamais `= undefined`).
- Dans le process main, `new Date().toISOString()` est autorisé (interdit uniquement dans les scripts Workflow).

---

## File Structure

**Nouveaux fichiers (main) :**
- `src/main/stores/projectStore.ts` — CRUD projets + helpers environnements scopés projet.
- `src/main/stores/tunnelStore.ts` — CRUD tunnels.
- `src/main/migration.ts` — migration de l'ancien layout vers `projects/`.

**Modifiés (main) :**
- `src/shared/types.ts` — `Platform` + `responsive`, `Project`, `Tunnel`, champs `projectId`/`tunnelId` sur `Scenario`.
- `src/main/stores/scenarioStore.ts` — rescopé par projet/tunnel.
- `src/main/stores/environmentStore.ts` — **supprimé** (logique migrée dans `projectStore`).
- `src/main/recorder/playwrightRecorder.ts` — opts `projectId`/`tunnelId`, env scopé.
- `src/main/runner/playwrightRunner.ts` — `updateLastRun` scopé.
- `src/main/seed.ts` — seed un projet/tunnel par défaut.
- `src/main/index.ts` — appelle la migration avant le seed.
- `src/main/workspace.ts` — `ensureWorkspace` crée `projects/` + `runs/`.
- `src/main/ipc/handlers.ts`, `src/main/ipc/register.ts`, `src/main/ipc/recordingHandlers.ts` — nouveaux canaux.
- `src/preload/index.ts`, `src/renderer/api.d.ts` — surface API.

**Nouveaux fichiers (renderer) :**
- `src/renderer/components/PlatformIcon.tsx` — icônes plateforme ISO maquette.
- `src/renderer/components/ProjectSwitcher.tsx` — bandeau switcher + EnvPicker.
- `src/renderer/screens/Projects.tsx` — gestion projets + environnements.

**Modifiés (renderer) :**
- `src/renderer/store.ts` — `projects`, `activeProjectId`.
- `src/renderer/components/EnvPicker.tsx` — environnements du projet actif.
- `src/renderer/screens/HubLibrary.tsx` — groupé par tunnel + `PlatformIcon`.
- `src/renderer/screens/NewScenario.tsx` — sélecteur tunnel + carte responsive.
- `src/renderer/screens/History.tsx` — scénarios du projet actif.
- `src/renderer/components/Sidebar.tsx` — item « Projets ».
- `src/renderer/components/TitleBar.tsx` — titre `/projects`.
- `src/renderer/App.tsx` — route `/projects` + bandeau switcher.

---

## Task 1: Types + projectStore + tunnelStore

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/stores/projectStore.ts`
- Create: `src/main/stores/tunnelStore.ts`
- Modify: `src/main/workspace.ts`
- Test: `tests/main/projectStore.test.ts`
- Test: `tests/main/tunnelStore.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  - `type Platform = "web" | "responsive" | "mobile"`
  - `interface Project { id: string; name: string; description: string; environments: Environment[]; createdAt: string }`
  - `interface Tunnel { id: string; projectId: string; name: string; order: number; createdAt: string }`
  - `Scenario` gains `projectId: string; tunnelId: string`
- Produces (`projectStore.ts`): `defaultEnvironments(): Environment[]`, `listProjects(): Project[]`, `getProject(id: string): Project`, `saveProject(p: Project): void`, `deleteProject(id: string): void`, `listEnvironments(projectId: string): Environment[]`, `getEnvironment(projectId: string, envId: string): Environment`, `saveEnvironment(projectId: string, env: Environment): void`, `deleteEnvironment(projectId: string, envId: string): void`
- Produces (`tunnelStore.ts`): `listTunnels(projectId: string): Tunnel[]`, `getTunnel(projectId: string, tunnelId: string): Tunnel`, `saveTunnel(t: Tunnel): void`, `deleteTunnel(projectId: string, tunnelId: string): void`
- Consumes: `getWorkspaceDir()` from `src/main/workspace.ts`

- [ ] **Step 1: Update shared types**

In `src/shared/types.ts`, change the `Platform` type and `Scenario` interface, and add `Project` and `Tunnel`. Replace the first line and the `Scenario` interface:

```ts
export type Platform = "web" | "responsive" | "mobile";
```

Add after the `Environment` interface:

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
	order: number;
	createdAt: string;
}
```

Change `Scenario` to add `projectId` and `tunnelId` right after `id`:

```ts
export interface Scenario {
	id: string;
	projectId: string;
	tunnelId: string;
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

- [ ] **Step 2: Update `ensureWorkspace`**

In `src/main/workspace.ts`, change the `ensureWorkspace` loop so it creates `projects` and `runs`:

```ts
export function ensureWorkspace(): void {
	const root = getWorkspaceDir();
	for (const sub of ["projects", "runs"])
		mkdirSync(join(root, sub), { recursive: true });
}
```

- [ ] **Step 3: Write the failing projectStore test**

Create `tests/main/projectStore.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/projectStore";
import type { Project } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-proj-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

function sample(id = "p1"): Project {
	return {
		id,
		name: "Projet A",
		description: "desc",
		environments: store.defaultEnvironments(),
		createdAt: "2026-06-24T00:00:00Z",
	};
}

describe("projectStore", () => {
	it("listProjects renvoie [] si aucun projet", () => {
		expect(store.listProjects()).toEqual([]);
	});
	it("sauvegarde puis liste un projet", () => {
		store.saveProject(sample());
		const all = store.listProjects();
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe("Projet A");
	});
	it("getProject renvoie le projet", () => {
		store.saveProject(sample());
		expect(store.getProject("p1").description).toBe("desc");
	});
	it("defaultEnvironments contient preprod et recette", () => {
		const ids = store.defaultEnvironments().map((e) => e.id);
		expect(ids).toContain("preprod");
		expect(ids).toContain("recette");
	});
	it("listEnvironments renvoie les environnements du projet", () => {
		store.saveProject(sample());
		expect(store.listEnvironments("p1").length).toBeGreaterThanOrEqual(2);
	});
	it("getEnvironment renvoie un environnement par id", () => {
		store.saveProject(sample());
		expect(store.getEnvironment("p1", "preprod").label).toBe("Préprod");
	});
	it("saveEnvironment ajoute puis met à jour un environnement", () => {
		store.saveProject(sample());
		store.saveEnvironment("p1", {
			id: "prod",
			label: "Prod",
			baseURL: "https://prod.example",
			variables: {},
		});
		expect(store.getEnvironment("p1", "prod").label).toBe("Prod");
		store.saveEnvironment("p1", {
			id: "prod",
			label: "Production",
			baseURL: "https://prod.example",
			variables: {},
		});
		expect(store.getEnvironment("p1", "prod").label).toBe("Production");
	});
	it("deleteEnvironment supprime sauf le dernier", () => {
		store.saveProject({ ...sample(), environments: store.defaultEnvironments() });
		store.deleteEnvironment("p1", "recette");
		expect(store.listEnvironments("p1").map((e) => e.id)).not.toContain(
			"recette",
		);
	});
	it("deleteEnvironment refuse de supprimer le dernier environnement", () => {
		store.saveProject({
			id: "p1",
			name: "x",
			description: "",
			environments: [
				{ id: "only", label: "Only", baseURL: "https://e", variables: {} },
			],
			createdAt: "2026-06-24T00:00:00Z",
		});
		expect(() => store.deleteEnvironment("p1", "only")).toThrow();
	});
	it("deleteProject supprime sauf le dernier projet", () => {
		store.saveProject(sample("p1"));
		store.saveProject(sample("p2"));
		store.deleteProject("p1");
		expect(store.listProjects().map((p) => p.id)).toEqual(["p2"]);
	});
	it("deleteProject refuse de supprimer le dernier projet", () => {
		store.saveProject(sample("p1"));
		expect(() => store.deleteProject("p1")).toThrow();
	});
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/main/projectStore.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/stores/projectStore'`.

- [ ] **Step 5: Implement projectStore**

Create `src/main/stores/projectStore.ts`:

```ts
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Environment, Project } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

export function defaultEnvironments(): Environment[] {
	return [
		{
			id: "preprod",
			label: "Préprod",
			baseURL: "https://preprod.ouigo.example",
			variables: {},
		},
		{
			id: "recette",
			label: "Recette",
			baseURL: "https://recette.ouigo.example",
			variables: {},
		},
	];
}

function projectsDir(): string {
	return join(getWorkspaceDir(), "projects");
}

function projectDir(id: string): string {
	return join(projectsDir(), id);
}

function metaPath(id: string): string {
	return join(projectDir(id), "project.json");
}

function ensureProjectsDir(): void {
	mkdirSync(projectsDir(), { recursive: true });
}

export function listProjects(): Project[] {
	ensureProjectsDir();
	const base = projectsDir();
	const results: Project[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "project.json");
		if (!existsSync(meta)) continue;
		results.push(JSON.parse(readFileSync(meta, "utf-8")) as Project);
	}
	return results;
}

export function getProject(id: string): Project {
	const meta = metaPath(id);
	if (!existsSync(meta)) throw new Error(`Project not found: ${id}`);
	return JSON.parse(readFileSync(meta, "utf-8")) as Project;
}

export function saveProject(p: Project): void {
	mkdirSync(projectDir(p.id), { recursive: true });
	writeFileSync(metaPath(p.id), JSON.stringify(p, null, 2), "utf-8");
}

export function deleteProject(id: string): void {
	if (listProjects().length <= 1) {
		throw new Error("Cannot delete the last project");
	}
	const dir = projectDir(id);
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function listEnvironments(projectId: string): Environment[] {
	return getProject(projectId).environments;
}

export function getEnvironment(
	projectId: string,
	envId: string,
): Environment {
	const found = getProject(projectId).environments.find(
		(e) => e.id === envId,
	);
	if (!found) {
		throw new Error(`Environment not found: ${envId} in project ${projectId}`);
	}
	return found;
}

export function saveEnvironment(projectId: string, env: Environment): void {
	const project = getProject(projectId);
	const idx = project.environments.findIndex((e) => e.id === env.id);
	if (idx !== -1) project.environments[idx] = env;
	else project.environments.push(env);
	saveProject(project);
}

export function deleteEnvironment(projectId: string, envId: string): void {
	const project = getProject(projectId);
	if (project.environments.length <= 1) {
		throw new Error("Cannot delete the last environment");
	}
	project.environments = project.environments.filter((e) => e.id !== envId);
	saveProject(project);
}
```

- [ ] **Step 6: Run the projectStore test to verify it passes**

Run: `npm test -- tests/main/projectStore.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Write the failing tunnelStore test**

Create `tests/main/tunnelStore.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/tunnelStore";
import type { Tunnel } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-tun-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

function tunnel(id: string, order: number): Tunnel {
	return {
		id,
		projectId: "p1",
		name: `Tunnel ${id}`,
		order,
		createdAt: "2026-06-24T00:00:00Z",
	};
}

// Creates a scenario directory under a tunnel to simulate a non-empty tunnel.
function addScenarioDir(tunnelId: string, scenarioId: string): void {
	const sdir = join(
		dir,
		"projects",
		"p1",
		"tunnels",
		tunnelId,
		"scenarios",
		scenarioId,
	);
	mkdirSync(sdir, { recursive: true });
	writeFileSync(join(sdir, "scenario.meta.json"), "{}", "utf-8");
}

describe("tunnelStore", () => {
	it("listTunnels renvoie [] si aucun tunnel", () => {
		expect(store.listTunnels("p1")).toEqual([]);
	});
	it("sauvegarde et liste les tunnels triés par order", () => {
		store.saveTunnel(tunnel("b", 1));
		store.saveTunnel(tunnel("a", 0));
		expect(store.listTunnels("p1").map((t) => t.id)).toEqual(["a", "b"]);
	});
	it("getTunnel renvoie un tunnel", () => {
		store.saveTunnel(tunnel("a", 0));
		expect(store.getTunnel("p1", "a").name).toBe("Tunnel a");
	});
	it("deleteTunnel supprime un tunnel vide non-dernier", () => {
		store.saveTunnel(tunnel("a", 0));
		store.saveTunnel(tunnel("b", 1));
		store.deleteTunnel("p1", "a");
		expect(store.listTunnels("p1").map((t) => t.id)).toEqual(["b"]);
	});
	it("deleteTunnel refuse de supprimer le dernier tunnel", () => {
		store.saveTunnel(tunnel("a", 0));
		expect(() => store.deleteTunnel("p1", "a")).toThrow();
	});
	it("deleteTunnel refuse de supprimer un tunnel non vide", () => {
		store.saveTunnel(tunnel("a", 0));
		store.saveTunnel(tunnel("b", 1));
		addScenarioDir("a", "s1");
		expect(() => store.deleteTunnel("p1", "a")).toThrow();
	});
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- tests/main/tunnelStore.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/stores/tunnelStore'`.

- [ ] **Step 9: Implement tunnelStore**

Create `src/main/stores/tunnelStore.ts`:

```ts
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Tunnel } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function tunnelsDir(projectId: string): string {
	return join(getWorkspaceDir(), "projects", projectId, "tunnels");
}

function tunnelDir(projectId: string, tunnelId: string): string {
	return join(tunnelsDir(projectId), tunnelId);
}

function metaPath(projectId: string, tunnelId: string): string {
	return join(tunnelDir(projectId, tunnelId), "tunnel.json");
}

export function listTunnels(projectId: string): Tunnel[] {
	const base = tunnelsDir(projectId);
	mkdirSync(base, { recursive: true });
	const results: Tunnel[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "tunnel.json");
		if (!existsSync(meta)) continue;
		results.push(JSON.parse(readFileSync(meta, "utf-8")) as Tunnel);
	}
	return results.sort((a, b) => a.order - b.order);
}

export function getTunnel(projectId: string, tunnelId: string): Tunnel {
	const meta = metaPath(projectId, tunnelId);
	if (!existsSync(meta)) {
		throw new Error(`Tunnel not found: ${tunnelId} in project ${projectId}`);
	}
	return JSON.parse(readFileSync(meta, "utf-8")) as Tunnel;
}

export function saveTunnel(t: Tunnel): void {
	mkdirSync(tunnelDir(t.projectId, t.id), { recursive: true });
	writeFileSync(
		metaPath(t.projectId, t.id),
		JSON.stringify(t, null, 2),
		"utf-8",
	);
}

function tunnelHasScenarios(projectId: string, tunnelId: string): boolean {
	const scenariosDir = join(tunnelDir(projectId, tunnelId), "scenarios");
	if (!existsSync(scenariosDir)) return false;
	return readdirSync(scenariosDir, { withFileTypes: true }).some((e) =>
		e.isDirectory(),
	);
}

export function deleteTunnel(projectId: string, tunnelId: string): void {
	if (listTunnels(projectId).length <= 1) {
		throw new Error("Cannot delete the last tunnel of a project");
	}
	if (tunnelHasScenarios(projectId, tunnelId)) {
		throw new Error("Cannot delete a tunnel that still contains scenarios");
	}
	const dir = tunnelDir(projectId, tunnelId);
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 10: Run the tunnelStore test to verify it passes**

Run: `npm test -- tests/main/tunnelStore.test.ts`
Expected: PASS.

- [ ] **Step 11: Lint and commit**

```bash
npx @biomejs/biome check --write src/shared/types.ts src/main/stores/projectStore.ts src/main/stores/tunnelStore.ts src/main/workspace.ts tests/main/projectStore.test.ts tests/main/tunnelStore.test.ts
npm run lint
git add src/shared/types.ts src/main/stores/projectStore.ts src/main/stores/tunnelStore.ts src/main/workspace.ts tests/main/projectStore.test.ts tests/main/tunnelStore.test.ts
git commit -m "feat: project & tunnel stores + project-scoped environments"
```

---

## Task 2: Rescope scenarioStore + main callers (recorder, runner); remove environmentStore

**Files:**
- Modify: `src/main/stores/scenarioStore.ts`
- Delete: `src/main/stores/environmentStore.ts`
- Modify: `src/main/recorder/playwrightRecorder.ts`
- Modify: `src/main/runner/playwrightRunner.ts`
- Modify: `src/main/recorder/recordingHandlers` is NOT here (Task 4); only the recorder module.
- Test: `tests/main/scenarioStore.test.ts` (rewrite)
- Test: `tests/main/playwrightRecorder.test.ts` (update setup), `tests/main/playwrightRunner.test.ts` (update setup)

**Interfaces:**
- Consumes: `Project`/`Tunnel`/`Scenario` types and `projectStore`/`tunnelStore` from Task 1.
- Produces (`scenarioStore.ts`): `listScenarios(projectId: string, tunnelId: string): Scenario[]`, `listScenariosByProject(projectId: string): Scenario[]`, `getScenario(projectId: string, tunnelId: string, id: string): Scenario`, `saveScenario(s: Scenario, specContent: string): void`, `deleteScenario(projectId: string, tunnelId: string, id: string): void`, `updateLastRun(projectId: string, tunnelId: string, id: string, lastRun: LastRun): void`
- Produces (recorder): `startRecording` opts gain `projectId: string; tunnelId: string`; the produced `Scenario` carries them.

- [ ] **Step 1: Rewrite the scenarioStore test**

Replace the entire contents of `tests/main/scenarioStore.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/scenarioStore";
import type { Scenario } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

const sample: Scenario = {
	id: "login",
	projectId: "default",
	tunnelId: "general",
	name: "Connexion",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "preprod",
	tags: ["auth"],
	specFile: "login.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

describe("scenarioStore", () => {
	it("sauvegarde puis liste un scénario dans son tunnel", () => {
		store.saveScenario(sample, 'test("ok", () => {});');
		const all = store.listScenarios("default", "general");
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe("Connexion");
	});
	it("getScenario renvoie le scénario", () => {
		store.saveScenario(sample, "x");
		expect(store.getScenario("default", "general", "login").specFile).toBe(
			"login.spec.ts",
		);
	});
	it("listScenariosByProject agrège tous les tunnels", () => {
		store.saveScenario(sample, "x");
		store.saveScenario(
			{ ...sample, id: "search", tunnelId: "booking", name: "Recherche" },
			"x",
		);
		const all = store.listScenariosByProject("default");
		expect(all.map((s) => s.id).sort()).toEqual(["login", "search"]);
	});
	it("met à jour lastRun", () => {
		store.saveScenario(sample, "x");
		store.updateLastRun("default", "general", "login", {
			status: "passed",
			at: "2026-06-23T01:00:00Z",
			durationMs: 1200,
		});
		expect(
			store.getScenario("default", "general", "login").lastRun.status,
		).toBe("passed");
	});
	it("supprime un scénario", () => {
		store.saveScenario(sample, "x");
		store.deleteScenario("default", "general", "login");
		expect(store.listScenarios("default", "general")).toHaveLength(0);
	});
	it("listScenarios renvoie [] si aucun scénario", () => {
		expect(store.listScenarios("default", "general")).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/main/scenarioStore.test.ts`
Expected: FAIL — signature mismatches / wrong paths.

- [ ] **Step 3: Rewrite scenarioStore**

Replace the entire contents of `src/main/stores/scenarioStore.ts`:

```ts
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { LastRun, Scenario } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function tunnelScenariosDir(projectId: string, tunnelId: string): string {
	return join(
		getWorkspaceDir(),
		"projects",
		projectId,
		"tunnels",
		tunnelId,
		"scenarios",
	);
}

function scenarioDir(
	projectId: string,
	tunnelId: string,
	id: string,
): string {
	return join(tunnelScenariosDir(projectId, tunnelId), id);
}

function metaPath(projectId: string, tunnelId: string, id: string): string {
	return join(scenarioDir(projectId, tunnelId, id), "scenario.meta.json");
}

function tunnelsDir(projectId: string): string {
	return join(getWorkspaceDir(), "projects", projectId, "tunnels");
}

export function listScenarios(
	projectId: string,
	tunnelId: string,
): Scenario[] {
	const base = tunnelScenariosDir(projectId, tunnelId);
	mkdirSync(base, { recursive: true });
	const results: Scenario[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "scenario.meta.json");
		if (!existsSync(meta)) continue;
		results.push(JSON.parse(readFileSync(meta, "utf-8")) as Scenario);
	}
	return results;
}

export function listScenariosByProject(projectId: string): Scenario[] {
	const base = tunnelsDir(projectId);
	if (!existsSync(base)) return [];
	const results: Scenario[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		results.push(...listScenarios(projectId, entry.name));
	}
	return results;
}

export function getScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): Scenario {
	const meta = metaPath(projectId, tunnelId, id);
	if (!existsSync(meta)) throw new Error(`Scenario not found: ${id}`);
	return JSON.parse(readFileSync(meta, "utf-8")) as Scenario;
}

export function saveScenario(s: Scenario, specContent: string): void {
	const dir = scenarioDir(s.projectId, s.tunnelId, s.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		metaPath(s.projectId, s.tunnelId, s.id),
		JSON.stringify(s, null, 2),
		"utf-8",
	);
	writeFileSync(join(dir, s.specFile), specContent, "utf-8");
}

export function deleteScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): void {
	const dir = scenarioDir(projectId, tunnelId, id);
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function updateLastRun(
	projectId: string,
	tunnelId: string,
	id: string,
	lastRun: LastRun,
): void {
	const scenario = getScenario(projectId, tunnelId, id);
	scenario.lastRun = lastRun;
	writeFileSync(
		metaPath(projectId, tunnelId, id),
		JSON.stringify(scenario, null, 2),
		"utf-8",
	);
}
```

- [ ] **Step 4: Run the scenarioStore test to verify it passes**

Run: `npm test -- tests/main/scenarioStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete environmentStore**

```bash
git rm src/main/stores/environmentStore.ts
```

(Its `defaultEnvironments` logic now lives in `projectStore`. Any remaining import is updated below and in Task 4.)

- [ ] **Step 6: Update the recorder**

In `src/main/recorder/playwrightRecorder.ts`, make these edits:

Change the import line `import { getEnvironment } from "../stores/environmentStore";` to:

```ts
import { getEnvironment } from "../stores/projectStore";
```

Add `projectId`/`tunnelId` to the `RecordingSession` interface:

```ts
interface RecordingSession {
	child: ChildProcess;
	outFile: string;
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
}
```

Rewrite `uniqueId` to take the scope (it checks id availability in the target tunnel):

```ts
function uniqueId(
	projectId: string,
	tunnelId: string,
	base: string,
): string {
	let candidate = base;
	let counter = 2;
	while (true) {
		try {
			getScenario(projectId, tunnelId, candidate);
			candidate = `${base}-${counter}`;
			counter++;
		} catch {
			return candidate;
		}
	}
}
```

Change the `startRecording` signature and env lookup. Replace the opts type and the `getEnvironment` call:

```ts
	async startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
	}): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
```

Add `projectId`/`tunnelId` when storing the session:

```ts
		activeRecordings.set(recordingId, {
			child,
			outFile,
			name: opts.name,
			browser: opts.browser,
			environmentId: opts.environmentId,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
		});
```

In `stopRecording`, change the id computation and the produced scenario:

```ts
		const id = uniqueId(
			session.projectId,
			session.tunnelId,
			slugify(session.name),
		);

		const scenario: Scenario = {
			id,
			projectId: session.projectId,
			tunnelId: session.tunnelId,
			name: session.name,
			platform: "web",
			browser: session.browser,
			defaultEnvironmentId: session.environmentId,
			tags: [],
			specFile: `${id}.spec.ts`,
			createdAt: new Date().toISOString(),
			lastRun: { status: "never" },
		};
```

- [ ] **Step 7: Update the runner**

In `src/main/runner/playwrightRunner.ts`, find the `updateLastRun(scenario.id, {` call (around line 177) and change it to pass the scenario scope:

```ts
				updateLastRun(scenario.projectId, scenario.tunnelId, scenario.id, {
```

(The rest of that call — the `lastRun` object literal — is unchanged. The `scenario` parameter already carries `projectId`/`tunnelId`.)

- [ ] **Step 8: Update the recorder & runner tests' fixtures**

Open `tests/main/playwrightRecorder.test.ts`. Wherever it calls `startRecording({...})`, add `projectId: "default", tunnelId: "general"` to the opts, and ensure a `default` project with a `general` tunnel and the referenced environment exists before recording. Add this helper near the top (after imports) and call it in `beforeEach` after setting `OTL_WORKSPACE`:

```ts
import { saveProject } from "../../src/main/stores/projectStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";

function seedDefaultProject(baseURL: string): void {
	saveProject({
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [
			{ id: "local", label: "Local", baseURL, variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	});
	saveTunnel({
		id: "general",
		projectId: "default",
		name: "Général",
		order: 0,
		createdAt: "2026-06-24T00:00:00Z",
	});
}
```

Then, in the test's `beforeEach`, after `process.env.OTL_WORKSPACE = dir;`, call `seedDefaultProject("https://example.test")` (or reuse whatever baseURL/env id the existing test references — match the `environmentId` passed to `startRecording`). Update any assertion that reads a saved scenario via `getScenario(id)` to `getScenario("default", "general", id)`.

Apply the same scoping to `tests/main/playwrightRunner.test.ts`: it constructs a `Scenario` and runs it — add `projectId: "default", tunnelId: "general"` to that scenario literal, and `seedDefaultProject(...)` so `updateLastRun` can find it. If the runner test passes an `Environment` object directly to `playwrightRunner.run`, no project seeding is needed for the env, but `updateLastRun` still requires the scenario dir to exist — `saveScenario` it first (the existing test likely already does; just add the two new fields to the literal).

- [ ] **Step 9: Run recorder & runner tests**

Run: `npm test -- tests/main/playwrightRecorder.test.ts tests/main/playwrightRunner.test.ts tests/main/scenarioStore.test.ts`
Expected: PASS. If a recorder/runner test fails because it still references the old flat path or 1-arg `getScenario`, finish updating it per Step 8.

- [ ] **Step 10: Lint and commit**

```bash
npx @biomejs/biome check --write src/main tests/main
npm run lint
git add -A
git commit -m "feat: project/tunnel-scoped scenarioStore; recorder & runner scoped; drop environmentStore"
```

---

## Task 3: Migration + seed + wire into main entrypoint

**Files:**
- Create: `src/main/migration.ts`
- Modify: `src/main/seed.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/migration.test.ts`
- Test: `tests/main/seed.test.ts` (rewrite)

**Interfaces:**
- Consumes: `projectStore` (`saveProject`, `listProjects`, `defaultEnvironments`, `saveEnvironment`, `getProject`), `tunnelStore` (`saveTunnel`), `scenarioStore` (`saveScenario`, `listScenariosByProject`), `getWorkspaceDir`.
- Produces: `migrateWorkspaceIfNeeded(): void`; `seedIfEmpty(appRoot: string): void` (signature unchanged, behaviour updated).

- [ ] **Step 1: Write the failing migration test**

Create `tests/main/migration.test.ts`:

```ts
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateWorkspaceIfNeeded } from "../../src/main/migration";
import { getProject, listProjects } from "../../src/main/stores/projectStore";
import { listScenariosByProject } from "../../src/main/stores/scenarioStore";
import { listTunnels } from "../../src/main/stores/tunnelStore";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mig-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

// Builds the legacy flat layout: scenarios/<id>/{meta,spec} + environments.json
function writeLegacy(): void {
	const sdir = join(dir, "scenarios", "login");
	mkdirSync(sdir, { recursive: true });
	writeFileSync(
		join(sdir, "scenario.meta.json"),
		JSON.stringify({
			id: "login",
			name: "Connexion",
			platform: "web",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "login.spec.ts",
			createdAt: "2026-06-23T00:00:00Z",
			lastRun: { status: "never" },
		}),
		"utf-8",
	);
	writeFileSync(join(sdir, "login.spec.ts"), "// spec", "utf-8");
	writeFileSync(
		join(dir, "environments.json"),
		JSON.stringify({
			environments: [
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "https://preprod.example",
					variables: {},
				},
			],
		}),
		"utf-8",
	);
}

describe("migrateWorkspaceIfNeeded", () => {
	it("ne fait rien si aucun ancien layout", () => {
		migrateWorkspaceIfNeeded();
		expect(listProjects()).toEqual([]);
	});
	it("crée le projet par défaut et le tunnel Général", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		const projects = listProjects();
		expect(projects.map((p) => p.id)).toEqual(["default"]);
		expect(getProject("default").name).toBe("Projet par défaut");
		expect(listTunnels("default").map((t) => t.id)).toEqual(["general"]);
	});
	it("préserve les environnements de l'ancien environments.json", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		expect(getProject("default").environments.map((e) => e.id)).toContain(
			"preprod",
		);
	});
	it("déplace les scénarios dans le tunnel Général avec projectId/tunnelId", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		const scenarios = listScenariosByProject("default");
		expect(scenarios).toHaveLength(1);
		expect(scenarios[0].projectId).toBe("default");
		expect(scenarios[0].tunnelId).toBe("general");
	});
	it("supprime l'ancien dossier scenarios/ et environments.json", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		expect(existsSync(join(dir, "scenarios"))).toBe(false);
		expect(existsSync(join(dir, "environments.json"))).toBe(false);
	});
	it("est idempotent — un 2e appel ne duplique rien", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		migrateWorkspaceIfNeeded();
		expect(listProjects()).toHaveLength(1);
		expect(listScenariosByProject("default")).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/main/migration.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/migration'`.

- [ ] **Step 3: Implement migration**

Create `src/main/migration.ts`:

```ts
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Environment, Platform, Scenario } from "../shared/types";
import {
	defaultEnvironments,
	listProjects,
	saveProject,
} from "./stores/projectStore";
import { saveScenario } from "./stores/scenarioStore";
import { saveTunnel } from "./stores/tunnelStore";
import { getWorkspaceDir } from "./workspace";

const DEFAULT_PROJECT_ID = "default";
const GENERAL_TUNNEL_ID = "general";

function normalizePlatform(value: unknown): Platform {
	return value === "responsive" || value === "mobile" || value === "web"
		? value
		: "web";
}

function readLegacyEnvironments(workspace: string): Environment[] {
	const file = join(workspace, "environments.json");
	if (!existsSync(file)) return defaultEnvironments();
	const data = JSON.parse(readFileSync(file, "utf-8")) as {
		environments: Environment[];
	};
	return data.environments.length > 0
		? data.environments
		: defaultEnvironments();
}

export function migrateWorkspaceIfNeeded(): void {
	const workspace = getWorkspaceDir();
	const legacyScenariosDir = join(workspace, "scenarios");
	const legacyEnvFile = join(workspace, "environments.json");

	const hasLegacy =
		existsSync(legacyScenariosDir) || existsSync(legacyEnvFile);
	// Idempotent: once any project exists, migration has already run.
	if (!hasLegacy || listProjects().length > 0) return;

	const now = new Date().toISOString();

	saveProject({
		id: DEFAULT_PROJECT_ID,
		name: "Projet par défaut",
		description: "",
		environments: readLegacyEnvironments(workspace),
		createdAt: now,
	});
	saveTunnel({
		id: GENERAL_TUNNEL_ID,
		projectId: DEFAULT_PROJECT_ID,
		name: "Général",
		order: 0,
		createdAt: now,
	});

	if (existsSync(legacyScenariosDir)) {
		for (const entry of readdirSync(legacyScenariosDir, {
			withFileTypes: true,
		})) {
			if (!entry.isDirectory()) continue;
			const metaFile = join(
				legacyScenariosDir,
				entry.name,
				"scenario.meta.json",
			);
			if (!existsSync(metaFile)) continue;
			const old = JSON.parse(readFileSync(metaFile, "utf-8")) as Scenario;
			const specPath = join(legacyScenariosDir, entry.name, old.specFile);
			const specContent = existsSync(specPath)
				? readFileSync(specPath, "utf-8")
				: "";
			const migrated: Scenario = {
				...old,
				projectId: DEFAULT_PROJECT_ID,
				tunnelId: GENERAL_TUNNEL_ID,
				platform: normalizePlatform(old.platform),
			};
			saveScenario(migrated, specContent);
		}
	}

	rmSync(legacyScenariosDir, { recursive: true, force: true });
	rmSync(legacyEnvFile, { force: true });
}
```

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `npm test -- tests/main/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the seed test**

Replace the entire contents of `tests/main/seed.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedIfEmpty } from "../../src/main/seed";
import {
	getProject,
	listEnvironments,
	listProjects,
} from "../../src/main/stores/projectStore";
import { listScenariosByProject } from "../../src/main/stores/scenarioStore";

const REPO_ROOT = join(import.meta.dirname, "../..");
const FIXTURES_ROOT = join(REPO_ROOT, "fixtures");

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-seed-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_FIXTURES");
});

describe("seedIfEmpty", () => {
	it("crée le projet par défaut et le tunnel Général", () => {
		seedIfEmpty(REPO_ROOT);
		expect(listProjects().map((p) => p.id)).toContain("default");
	});
	it("seeds scenario named 'Parcours d'accueil'", () => {
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenariosByProject("default");
		expect(scenarios.some((s) => s.name === "Parcours d'accueil")).toBe(true);
	});
	it("seeds a 'local' environment with a file:// baseURL", () => {
		seedIfEmpty(REPO_ROOT);
		const local = listEnvironments("default").find((e) => e.id === "local");
		expect(local).toBeDefined();
		expect(local?.baseURL).toMatch(/^file:\/\//);
		expect(local?.baseURL).toContain("index.html");
	});
	it("is idempotent — exactly one 'Parcours d'accueil' scenario", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenariosByProject("default").filter(
			(s) => s.name === "Parcours d'accueil",
		);
		expect(scenarios).toHaveLength(1);
	});
	it("is idempotent — exactly one 'local' environment", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const locals = listEnvironments("default").filter((e) => e.id === "local");
		expect(locals).toHaveLength(1);
	});
	it("does not overwrite existing scenarios when not empty", () => {
		seedIfEmpty(REPO_ROOT);
		const afterFirst = listScenariosByProject("default").length;
		seedIfEmpty(REPO_ROOT);
		expect(listScenariosByProject("default")).toHaveLength(afterFirst);
	});
	it("seeds default project's environments include preprod", () => {
		seedIfEmpty(REPO_ROOT);
		expect(getProject("default").environments.map((e) => e.id)).toContain(
			"preprod",
		);
	});
	it("OTL_FIXTURES override seeds the scenario", () => {
		process.env.OTL_FIXTURES = FIXTURES_ROOT;
		seedIfEmpty("/nonexistent/approot");
		expect(
			listScenariosByProject("default").some(
				(s) => s.name === "Parcours d'accueil",
			),
		).toBe(true);
	});
});
```

- [ ] **Step 6: Run the seed test to verify it fails**

Run: `npm test -- tests/main/seed.test.ts`
Expected: FAIL — `seedIfEmpty` still references the removed `environmentStore` / flat `scenarioStore`.

- [ ] **Step 7: Rewrite seed.ts**

Replace the entire contents of `src/main/seed.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Environment, Scenario } from "../shared/types";
import {
	defaultEnvironments,
	getProject,
	listProjects,
	saveEnvironment,
	saveProject,
} from "./stores/projectStore";
import { saveScenario } from "./stores/scenarioStore";
import { saveTunnel } from "./stores/tunnelStore";
import { ensureWorkspace } from "./workspace";

const DEFAULT_PROJECT_ID = "default";
const GENERAL_TUNNEL_ID = "general";

function localEnvironment(fixturesRoot: string): Environment {
	const siteIndexPath = join(fixturesRoot, "site", "index.html");
	return {
		id: "local",
		label: "Local",
		baseURL: pathToFileURL(siteIndexPath).href,
		variables: {},
	};
}

function seedScenariosInto(fixturesRoot: string): void {
	const seedScenariosDir = join(fixturesRoot, "seed-scenarios");
	if (!existsSync(seedScenariosDir)) return;
	for (const entry of readdirSync(seedScenariosDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const src = join(seedScenariosDir, entry.name);
		const metaFile = join(src, "scenario.meta.json");
		if (!existsSync(metaFile)) continue;
		const meta = JSON.parse(readFileSync(metaFile, "utf-8")) as Scenario;
		const specContent = readFileSync(join(src, meta.specFile), "utf-8");
		saveScenario(
			{
				...meta,
				projectId: DEFAULT_PROJECT_ID,
				tunnelId: GENERAL_TUNNEL_ID,
			},
			specContent,
		);
	}
}

export function seedIfEmpty(appRoot: string): void {
	ensureWorkspace();

	const fixturesRoot = process.env.OTL_FIXTURES ?? join(appRoot, "fixtures");
	const local = localEnvironment(fixturesRoot);

	if (listProjects().length === 0) {
		saveProject({
			id: DEFAULT_PROJECT_ID,
			name: "Projet par défaut",
			description: "",
			environments: [...defaultEnvironments(), local],
			createdAt: new Date().toISOString(),
		});
		saveTunnel({
			id: GENERAL_TUNNEL_ID,
			projectId: DEFAULT_PROJECT_ID,
			name: "Général",
			order: 0,
			createdAt: new Date().toISOString(),
		});
		seedScenariosInto(fixturesRoot);
		return;
	}

	// Projects already exist (fresh seed done, or migrated): ensure 'local' env.
	const project = getProject(DEFAULT_PROJECT_ID);
	if (!project.environments.some((e) => e.id === "local")) {
		saveEnvironment(DEFAULT_PROJECT_ID, local);
	}
}
```

- [ ] **Step 8: Run the seed test to verify it passes**

Run: `npm test -- tests/main/seed.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire migration into the main entrypoint**

In `src/main/index.ts`, add the import and call `migrateWorkspaceIfNeeded()` between `ensureWorkspace()` and `seedIfEmpty(...)`:

```ts
import { migrateWorkspaceIfNeeded } from "./migration";
```

```ts
	ensureWorkspace();
	migrateWorkspaceIfNeeded();
	seedIfEmpty(appRoot);
```

- [ ] **Step 10: Run the full main suite, lint, commit**

Run: `npm test -- tests/main`
Expected: PASS (migration, seed, stores, recorder, runner all green).

```bash
npx @biomejs/biome check --write src/main tests/main
npm run lint
git add -A
git commit -m "feat: workspace migration to projects layout + project-aware seed"
```

---

## Task 4: IPC surface (handlers, register, preload, api.d.ts)

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/ipc/recordingHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/api.d.ts`
- Test: `tests/main/handlers.test.ts` (update + extend)

**Interfaces:**
- Consumes: `projectStore`, `tunnelStore`, `scenarioStore` (scoped), `reportStore.listReports`, `playwrightRunner`, `playwrightRecorder`.
- Produces (`window.api`):
  - `listProjects(): Promise<Project[]>`, `getProject(id): Promise<Project>`, `createProject({name, description}): Promise<Project>`, `updateProject(p: Project): Promise<void>`, `deleteProject(id): Promise<void>`
  - `listEnvironments(projectId): Promise<Environment[]>`, `saveEnvironment(projectId, env): Promise<void>`, `deleteEnvironment(projectId, envId): Promise<void>`
  - `listTunnels(projectId): Promise<Tunnel[]>`, `createTunnel({projectId, name}): Promise<Tunnel>`, `deleteTunnel(projectId, tunnelId): Promise<void>`
  - `listScenariosByProject(projectId): Promise<Scenario[]>`, `deleteScenario(projectId, tunnelId, scenarioId): Promise<void>`
  - `runScenario(projectId, tunnelId, scenarioId, envId): Promise<{runId: string}>`
  - `startRecording({name, browser, environmentId, projectId, tunnelId}): Promise<{recordingId}>`
- Helper produced for renderer id generation: `createProject`/`createTunnel` derive ids via `slugify` (reuse `src/main/recorder/slugify.ts`).

- [ ] **Step 1: Update the handlers test**

Open `tests/main/handlers.test.ts`. Update its setup to seed a `default` project (via `saveProject`/`saveTunnel`) and replace assertions that used the old flat stores. Add cases for the new project/tunnel handlers. Append these cases inside the existing `describe` (and add the imports + a `beforeEach` seed if not present):

```ts
import {
	handleCreateProject,
	handleCreateTunnel,
	handleListProjects,
	handleListTunnels,
} from "../../src/main/ipc/handlers";

// ... within describe, after seeding a default project + general tunnel:
it("handleCreateProject crée un projet avec tunnel Général et environnements", () => {
	const p = handleCreateProject({ name: "Site Web", description: "" });
	expect(p.name).toBe("Site Web");
	expect(p.environments.length).toBeGreaterThanOrEqual(2);
	expect(handleListTunnels(p.id).map((t) => t.id)).toEqual(["general"]);
	expect(handleListProjects().some((x) => x.id === p.id)).toBe(true);
});
it("handleCreateTunnel ajoute un tunnel ordonné", () => {
	const p = handleCreateProject({ name: "Site Web", description: "" });
	const t = handleCreateTunnel({ projectId: p.id, name: "Réservation" });
	expect(t.name).toBe("Réservation");
	expect(t.order).toBe(1);
	expect(handleListTunnels(p.id).map((t2) => t2.name)).toContain(
		"Réservation",
	);
});
```

(Match the file's existing import style and `beforeEach`/`OTL_WORKSPACE` setup. If the existing test asserted `handleListScenarios()` no-arg, remove or rewrite that case to `handleListScenariosByProject("default")`.)

- [ ] **Step 2: Run the handlers test to verify it fails**

Run: `npm test -- tests/main/handlers.test.ts`
Expected: FAIL — new handlers not exported.

- [ ] **Step 3: Rewrite handlers.ts**

Replace the entire contents of `src/main/ipc/handlers.ts`:

```ts
import type {
	Environment,
	Project,
	Report,
	ReportSummary,
	Scenario,
	Tunnel,
} from "../../shared/types";
import { slugify } from "../recorder/slugify";
import { isBrowserInstalled } from "../runner/ensureBrowsers";
import {
	defaultEnvironments,
	deleteEnvironment,
	deleteProject,
	getEnvironment,
	getProject,
	listEnvironments,
	listProjects,
	saveEnvironment,
	saveProject,
} from "../stores/projectStore";
import { getReport, listReports } from "../stores/reportStore";
import {
	deleteScenario,
	listScenariosByProject,
} from "../stores/scenarioStore";
import {
	deleteTunnel,
	getTunnel,
	listTunnels,
	saveTunnel,
} from "../stores/tunnelStore";

function uniqueProjectId(base: string): string {
	const existing = new Set(listProjects().map((p) => p.id));
	let candidate = base || "projet";
	let n = 2;
	while (existing.has(candidate)) candidate = `${base}-${n++}`;
	return candidate;
}

function uniqueTunnelId(projectId: string, base: string): string {
	const existing = new Set(listTunnels(projectId).map((t) => t.id));
	let candidate = base || "tunnel";
	let n = 2;
	while (existing.has(candidate)) candidate = `${base}-${n++}`;
	return candidate;
}

export function handleListProjects(): Project[] {
	return listProjects();
}

export function handleGetProject(id: string): Project {
	return getProject(id);
}

export function handleCreateProject(input: {
	name: string;
	description: string;
}): Project {
	const id = uniqueProjectId(slugify(input.name));
	const now = new Date().toISOString();
	const project: Project = {
		id,
		name: input.name,
		description: input.description,
		environments: defaultEnvironments(),
		createdAt: now,
	};
	saveProject(project);
	saveTunnel({
		id: "general",
		projectId: id,
		name: "Général",
		order: 0,
		createdAt: now,
	});
	return project;
}

export function handleUpdateProject(p: Project): void {
	saveProject(p);
}

export function handleDeleteProject(id: string): void {
	deleteProject(id);
}

export function handleListEnvironments(projectId: string): Environment[] {
	return listEnvironments(projectId);
}

export function handleSaveEnvironment(
	projectId: string,
	env: Environment,
): void {
	saveEnvironment(projectId, env);
}

export function handleDeleteEnvironment(
	projectId: string,
	envId: string,
): void {
	deleteEnvironment(projectId, envId);
}

export function handleListTunnels(projectId: string): Tunnel[] {
	return listTunnels(projectId);
}

export function handleCreateTunnel(input: {
	projectId: string;
	name: string;
}): Tunnel {
	const id = uniqueTunnelId(input.projectId, slugify(input.name));
	const order = listTunnels(input.projectId).length;
	const tunnel: Tunnel = {
		id,
		projectId: input.projectId,
		name: input.name,
		order,
		createdAt: new Date().toISOString(),
	};
	saveTunnel(tunnel);
	return tunnel;
}

export function handleDeleteTunnel(projectId: string, tunnelId: string): void {
	deleteTunnel(projectId, tunnelId);
}

export function handleListScenariosByProject(projectId: string): Scenario[] {
	return listScenariosByProject(projectId);
}

export function handleDeleteScenario(
	projectId: string,
	tunnelId: string,
	id: string,
): void {
	deleteScenario(projectId, tunnelId, id);
}

export function handleListReports(scenarioId?: string): ReportSummary[] {
	return listReports(scenarioId);
}

export function handleGetReport(runId: string): Report {
	return getReport(runId);
}

export function handleBrowsersReady(): boolean {
	return isBrowserInstalled("chromium");
}

export { getEnvironment, getTunnel };
```

- [ ] **Step 4: Rewrite register.ts**

Replace the entire contents of `src/main/ipc/register.ts`:

```ts
import { BrowserWindow, ipcMain } from "electron";
import type { Environment, Project } from "../../shared/types";
import { installBrowser } from "../runner/ensureBrowsers";
import { playwrightRunner } from "../runner/playwrightRunner";
import { getScenario } from "../stores/scenarioStore";
import {
	getEnvironment,
	handleBrowsersReady,
	handleCreateProject,
	handleCreateTunnel,
	handleDeleteEnvironment,
	handleDeleteProject,
	handleDeleteScenario,
	handleDeleteTunnel,
	handleGetProject,
	handleGetReport,
	handleListEnvironments,
	handleListProjects,
	handleListReports,
	handleListScenariosByProject,
	handleListTunnels,
	handleSaveEnvironment,
	handleUpdateProject,
} from "./handlers";
import { handleStartRecording, handleStopRecording } from "./recordingHandlers";

export function registerIpc(): void {
	ipcMain.on("window:minimize", (e) =>
		BrowserWindow.fromWebContents(e.sender)?.minimize(),
	);
	ipcMain.on("window:maximize", (e) => {
		const w = BrowserWindow.fromWebContents(e.sender);
		if (!w) return;
		if (w.isMaximized()) w.unmaximize();
		else w.maximize();
	});
	ipcMain.on("window:close", (e) =>
		BrowserWindow.fromWebContents(e.sender)?.close(),
	);

	ipcMain.handle("browsers:ready", () => handleBrowsersReady());
	ipcMain.handle("browsers:install", async () => {
		await installBrowser("chromium");
		return true;
	});

	// Projects
	ipcMain.handle("project:list", () => handleListProjects());
	ipcMain.handle("project:get", (_e, id: string) => handleGetProject(id));
	ipcMain.handle(
		"project:create",
		(_e, input: { name: string; description: string }) =>
			handleCreateProject(input),
	);
	ipcMain.handle("project:update", (_e, p: Project) => handleUpdateProject(p));
	ipcMain.handle("project:delete", (_e, id: string) => handleDeleteProject(id));

	// Environments (project-scoped)
	ipcMain.handle("environment:list", (_e, projectId: string) =>
		handleListEnvironments(projectId),
	);
	ipcMain.handle(
		"environment:save",
		(_e, projectId: string, env: Environment) =>
			handleSaveEnvironment(projectId, env),
	);
	ipcMain.handle(
		"environment:delete",
		(_e, projectId: string, envId: string) =>
			handleDeleteEnvironment(projectId, envId),
	);

	// Tunnels
	ipcMain.handle("tunnel:list", (_e, projectId: string) =>
		handleListTunnels(projectId),
	);
	ipcMain.handle(
		"tunnel:create",
		(_e, input: { projectId: string; name: string }) =>
			handleCreateTunnel(input),
	);
	ipcMain.handle(
		"tunnel:delete",
		(_e, projectId: string, tunnelId: string) =>
			handleDeleteTunnel(projectId, tunnelId),
	);

	// Scenarios
	ipcMain.handle("scenario:listByProject", (_e, projectId: string) =>
		handleListScenariosByProject(projectId),
	);
	ipcMain.handle(
		"scenario:delete",
		(_e, projectId: string, tunnelId: string, scenarioId: string) =>
			handleDeleteScenario(projectId, tunnelId, scenarioId),
	);

	ipcMain.handle("report:list", (_e, scenarioId?: string) =>
		handleListReports(scenarioId),
	);
	ipcMain.handle("report:get", (_e, runId: string) => handleGetReport(runId));

	ipcMain.handle(
		"scenario:run",
		async (
			event,
			projectId: string,
			tunnelId: string,
			scenarioId: string,
			envId: string,
		) => {
			const scenario = getScenario(projectId, tunnelId, scenarioId);
			const env = getEnvironment(projectId, envId);

			let runId = "";
			const ready = new Promise<string>((resolve) => {
				void playwrightRunner.run(scenario, env, (ev) => {
					if (ev.type === "run-started") {
						runId = ev.runId;
						resolve(runId);
					}
					if (runId) event.sender.send(`run-event:${runId}`, ev);
				});
			});

			return { runId: await ready };
		},
	);

	ipcMain.handle("run:cancel", (_e, runId: string) =>
		playwrightRunner.cancel(runId),
	);

	ipcMain.handle("recording:start", (_e, opts) => handleStartRecording(opts));
	ipcMain.handle("recording:stop", (_e, id: string) =>
		handleStopRecording(id),
	);
}
```

- [ ] **Step 5: Update recordingHandlers.ts**

In `src/main/ipc/recordingHandlers.ts`, extend `StartRecordingOpts`:

```ts
export interface StartRecordingOpts {
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
}
```

(The function bodies are unchanged — they forward `opts` to `playwrightRecorder`.)

- [ ] **Step 6: Update preload**

Replace the body of `src/preload/index.ts`'s `exposeInMainWorld` so it matches the new channels. Replace the import line and the scenario/environment/recording sections:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type {
	Environment,
	Project,
	RunEvent,
} from "../shared/types";

contextBridge.exposeInMainWorld("api", {
	platform: process.platform,
	windowControls: {
		minimize() {
			ipcRenderer.send("window:minimize");
		},
		maximize() {
			ipcRenderer.send("window:maximize");
		},
		close() {
			ipcRenderer.send("window:close");
		},
	},
	browsersReady() {
		return ipcRenderer.invoke("browsers:ready");
	},
	installBrowsers() {
		return ipcRenderer.invoke("browsers:install");
	},

	listProjects() {
		return ipcRenderer.invoke("project:list");
	},
	getProject(id: string) {
		return ipcRenderer.invoke("project:get", id);
	},
	createProject(input: { name: string; description: string }) {
		return ipcRenderer.invoke("project:create", input);
	},
	updateProject(p: Project) {
		return ipcRenderer.invoke("project:update", p);
	},
	deleteProject(id: string) {
		return ipcRenderer.invoke("project:delete", id);
	},

	listEnvironments(projectId: string) {
		return ipcRenderer.invoke("environment:list", projectId);
	},
	saveEnvironment(projectId: string, env: Environment) {
		return ipcRenderer.invoke("environment:save", projectId, env);
	},
	deleteEnvironment(projectId: string, envId: string) {
		return ipcRenderer.invoke("environment:delete", projectId, envId);
	},

	listTunnels(projectId: string) {
		return ipcRenderer.invoke("tunnel:list", projectId);
	},
	createTunnel(input: { projectId: string; name: string }) {
		return ipcRenderer.invoke("tunnel:create", input);
	},
	deleteTunnel(projectId: string, tunnelId: string) {
		return ipcRenderer.invoke("tunnel:delete", projectId, tunnelId);
	},

	listScenariosByProject(projectId: string) {
		return ipcRenderer.invoke("scenario:listByProject", projectId);
	},
	deleteScenario(projectId: string, tunnelId: string, scenarioId: string) {
		return ipcRenderer.invoke(
			"scenario:delete",
			projectId,
			tunnelId,
			scenarioId,
		);
	},
	runScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
	) {
		return ipcRenderer.invoke(
			"scenario:run",
			projectId,
			tunnelId,
			scenarioId,
			envId,
		);
	},
	cancelRun(runId: string) {
		return ipcRenderer.invoke("run:cancel", runId);
	},
	onRunEvent(runId: string, cb: (e: RunEvent) => void) {
		const channel = `run-event:${runId}`;
		const listener = (_e: Electron.IpcRendererEvent, payload: RunEvent) =>
			cb(payload);
		ipcRenderer.on(channel, listener);
		return () => ipcRenderer.removeListener(channel, listener);
	},

	listReports(scenarioId?: string) {
		return ipcRenderer.invoke("report:list", scenarioId);
	},
	getReport(runId: string) {
		return ipcRenderer.invoke("report:get", runId);
	},

	startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
	}) {
		return ipcRenderer.invoke("recording:start", opts);
	},
	stopRecording(recordingId: string) {
		return ipcRenderer.invoke("recording:stop", recordingId);
	},
});
```

- [ ] **Step 7: Update api.d.ts**

Replace the entire contents of `src/renderer/api.d.ts`:

```ts
import type {
	Environment,
	Project,
	Report,
	ReportSummary,
	RunEvent,
	Scenario,
	Tunnel,
} from "../shared/types";

interface OtlApi {
	platform: NodeJS.Platform;
	windowControls: {
		minimize(): void;
		maximize(): void;
		close(): void;
	};
	browsersReady(): Promise<boolean>;
	installBrowsers(): Promise<boolean>;

	listProjects(): Promise<Project[]>;
	getProject(id: string): Promise<Project>;
	createProject(input: {
		name: string;
		description: string;
	}): Promise<Project>;
	updateProject(p: Project): Promise<void>;
	deleteProject(id: string): Promise<void>;

	listEnvironments(projectId: string): Promise<Environment[]>;
	saveEnvironment(projectId: string, env: Environment): Promise<void>;
	deleteEnvironment(projectId: string, envId: string): Promise<void>;

	listTunnels(projectId: string): Promise<Tunnel[]>;
	createTunnel(input: {
		projectId: string;
		name: string;
	}): Promise<Tunnel>;
	deleteTunnel(projectId: string, tunnelId: string): Promise<void>;

	listScenariosByProject(projectId: string): Promise<Scenario[]>;
	deleteScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
	): Promise<void>;
	runScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
	): Promise<{ runId: string }>;
	cancelRun(runId: string): Promise<void>;
	onRunEvent(runId: string, cb: (e: RunEvent) => void): () => void;

	listReports(scenarioId?: string): Promise<ReportSummary[]>;
	getReport(runId: string): Promise<Report>;

	startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
	}): Promise<{ recordingId: string }>;
	stopRecording(recordingId: string): Promise<Scenario>;
}

declare global {
	interface Window {
		api: OtlApi;
	}
}
```

- [ ] **Step 8: Run handlers test + full main suite + build**

Run: `npm test -- tests/main && npm run build`
Expected: PASS, and the build (which type-checks main + preload + renderer `.d.ts`) succeeds. Note: the renderer screens still use old API signatures and are fixed in Tasks 5-8; if `npm run build` type-checks the renderer and fails on those, run only `npm test -- tests/main` here and defer the full build to Task 8's final step. Record which is the case in the task report.

- [ ] **Step 9: Lint and commit**

```bash
npx @biomejs/biome check --write src/main src/preload src/renderer/api.d.ts tests/main
npm run lint
git add -A
git commit -m "feat: project/tunnel/scenario IPC surface (handlers, register, preload, api types)"
```

---

## Task 5: Renderer store, project switcher band, scoped EnvPicker & History

**Files:**
- Modify: `src/renderer/store.ts`
- Create: `src/renderer/components/ProjectSwitcher.tsx`
- Modify: `src/renderer/components/EnvPicker.tsx`
- Modify: `src/renderer/screens/History.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/theme.css` (switcher band classes)
- Test: `tests/renderer/projectSwitcher.test.tsx`

**Interfaces:**
- Consumes: `window.api.listProjects`, `window.api.listEnvironments(projectId)`.
- Produces (`store.ts`): Zustand state `{ projects: Project[]; activeProjectId: string; setProjects(p): void; setActiveProjectId(id): void; loadProjects(): Promise<void> }` plus existing `scenarios`/`setScenarios`. `activeProjectId` is persisted to `localStorage` under key `otl.activeProjectId`.
- Produces (`ProjectSwitcher.tsx`): default-exported `<ProjectSwitcher />` rendering a `<select>` of projects + an EnvPicker, and a "Gérer les projets" button navigating to `/projects`.

- [ ] **Step 1: Write the failing ProjectSwitcher test**

Create `tests/renderer/projectSwitcher.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSwitcher } from "../../src/renderer/components/ProjectSwitcher";
import { useAppStore } from "../../src/renderer/store";

const projects = [
	{
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [],
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "web",
		name: "Site Web",
		description: "",
		environments: [],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listProjects: vi.fn().mockResolvedValue(projects),
		listEnvironments: vi.fn().mockResolvedValue([]),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects, activeProjectId: "default" });
});
afterEach(() => {
	localStorage.clear();
});

describe("ProjectSwitcher", () => {
	it("liste les projets et reflète le projet actif", () => {
		render(
			<MemoryRouter>
				<ProjectSwitcher />
			</MemoryRouter>,
		);
		const select = screen.getByLabelText(/projet actif/i) as HTMLSelectElement;
		expect(select.value).toBe("default");
		expect(screen.getByRole("option", { name: "Site Web" })).toBeTruthy();
	});
	it("changer de projet met à jour activeProjectId", async () => {
		render(
			<MemoryRouter>
				<ProjectSwitcher />
			</MemoryRouter>,
		);
		fireEvent.change(screen.getByLabelText(/projet actif/i), {
			target: { value: "web" },
		});
		await waitFor(() =>
			expect(useAppStore.getState().activeProjectId).toBe("web"),
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/projectSwitcher.test.tsx`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement the store**

Replace the entire contents of `src/renderer/store.ts`:

```ts
import { create } from "zustand";
import type { Project, Scenario } from "../shared/types";

const ACTIVE_KEY = "otl.activeProjectId";

function readActiveId(): string {
	try {
		return localStorage.getItem(ACTIVE_KEY) ?? "";
	} catch {
		return "";
	}
}

function writeActiveId(id: string): void {
	try {
		localStorage.setItem(ACTIVE_KEY, id);
	} catch {
		/* ignore */
	}
}

interface AppState {
	scenarios: Scenario[];
	setScenarios: (s: Scenario[]) => void;
	projects: Project[];
	activeProjectId: string;
	setProjects: (p: Project[]) => void;
	setActiveProjectId: (id: string) => void;
	loadProjects: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
	scenarios: [],
	setScenarios: (scenarios) => set({ scenarios }),
	projects: [],
	activeProjectId: readActiveId(),
	setProjects: (projects) => set({ projects }),
	setActiveProjectId: (id) => {
		writeActiveId(id);
		set({ activeProjectId: id });
	},
	loadProjects: async () => {
		const projects = await window.api.listProjects();
		const stored = get().activeProjectId;
		const valid = projects.some((p) => p.id === stored);
		const activeProjectId = valid
			? stored
			: (projects[0]?.id ?? "");
		writeActiveId(activeProjectId);
		set({ projects, activeProjectId });
	},
}));
```

- [ ] **Step 4: Implement ProjectSwitcher**

Create `src/renderer/components/ProjectSwitcher.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { EnvPicker } from "./EnvPicker";
import { useAppStore } from "../store";

export function ProjectSwitcher(): JSX.Element {
	const navigate = useNavigate();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const [envId, setEnvId] = useAppStore((s) => [
		s.activeEnvId ?? "",
		() => undefined,
	]) as unknown as [string, (id: string) => void];

	return (
		<div className="otl-projectbar">
			<div className="otl-projectbar__left">
				<span className="otl-projectbar__label">Projet</span>
				<select
					className="otl-select"
					aria-label="Projet actif"
					value={activeProjectId}
					onChange={(e) => setActiveProjectId(e.target.value)}
				>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				<button
					type="button"
					className="otl-projectbar__manage"
					onClick={() => navigate("/projects")}
				>
					Gérer les projets
				</button>
			</div>
			<div className="otl-projectbar__right">
				<EnvPicker value={envId} onChange={setEnvId} />
			</div>
		</div>
	);
}
```

Note: the EnvPicker's selected value is local UI state used by the Hub; the switcher renders it for visibility but the Hub owns the chosen env (Task 6). To keep the switcher self-contained and avoid coupling, replace the `envId` wiring above with local state:

```tsx
import { useState } from "react";
// ...
	const [envId, setEnvId] = useState("");
```

(Delete the `useAppStore`-based `envId` block — use the `useState` version. The EnvPicker here is purely contextual display; the Hub keeps its own EnvPicker for launching.)

- [ ] **Step 5: Make EnvPicker project-scoped**

Replace the entire contents of `src/renderer/components/EnvPicker.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Environment } from "../../shared/types";
import { useAppStore } from "../store";

export function EnvPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (id: string) => void;
}): JSX.Element {
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [environments, setEnvironments] = useState<Environment[]>([]);

	useEffect(() => {
		if (!activeProjectId) {
			setEnvironments([]);
			return;
		}
		window.api
			.listEnvironments(activeProjectId)
			.then((envs) => setEnvironments(envs));
	}, [activeProjectId]);

	return (
		<select
			className="otl-select"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value="">Environnement par défaut</option>
			{environments.map((env) => (
				<option key={env.id} value={env.id}>
					{env.label}
				</option>
			))}
		</select>
	);
}
```

- [ ] **Step 6: Scope History to the active project**

In `src/renderer/screens/History.tsx`, replace the `useEffect` data load so it uses the active project's scenarios. Add the store import at the top:

```tsx
import { useAppStore } from "../store";
```

Replace the component's effect block:

```tsx
	const activeProjectId = useAppStore((s) => s.activeProjectId);

	useEffect(() => {
		Promise.all([
			window.api.listReports(),
			activeProjectId
				? window.api.listScenariosByProject(activeProjectId)
				: Promise.resolve([]),
		]).then(([reps, scenarios]: [ReportSummary[], Scenario[]]) => {
			const map = new Map<string, string>();
			for (const s of scenarios) map.set(s.id, s.name);
			setScenarioMap(map);
			setReports(reps);
		});
	}, [activeProjectId]);
```

- [ ] **Step 7: Mount the switcher band and load projects in App**

In `src/renderer/App.tsx`, add the switcher band under `<TitleBar />` and load projects on mount. Replace the file:

```tsx
import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppGate } from "./components/AppGate";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import History from "./screens/History";
import HubLibrary from "./screens/HubLibrary";
import LiveRun from "./screens/LiveRun";
import NewScenario from "./screens/NewScenario";
import Report from "./screens/Report";
import { useAppStore } from "./store";

function App(): JSX.Element {
	const loadProjects = useAppStore((s) => s.loadProjects);
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	return (
		<HashRouter>
			<div className="otl-root">
				<TitleBar />
				<ProjectSwitcher />
				<div className="otl-app">
					<Sidebar />
					<main className="otl-main">
						<AppGate>
							<Routes>
								<Route
									path="/"
									element={<Navigate to="/scenarios" replace />}
								/>
								<Route path="/scenarios" element={<HubLibrary />} />
								<Route path="/scenarios/new" element={<NewScenario />} />
								<Route path="/run/:runId" element={<LiveRun />} />
								<Route path="/report/:runId" element={<Report />} />
								<Route path="/reports" element={<History />} />
							</Routes>
						</AppGate>
					</main>
				</div>
			</div>
		</HashRouter>
	);
}

export default App;
```

- [ ] **Step 8: Add switcher band CSS**

In `src/renderer/theme.css`, append these classes (reusing existing tokens):

```css
.otl-projectbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 8px 18px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	background: var(--otl-sidebar-bg);
}
.otl-projectbar__left {
	display: flex;
	align-items: center;
	gap: 0.6rem;
}
.otl-projectbar__label {
	font-size: 10.5px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--otl-text-2);
}
.otl-projectbar__manage {
	background: none;
	border: none;
	color: var(--otl-text-3);
	font-size: 12px;
	cursor: pointer;
	text-decoration: underline;
}
.otl-projectbar__manage:hover {
	color: var(--otl-text);
}
```

- [ ] **Step 9: Run the test, lint, commit**

Run: `npm test -- tests/renderer/projectSwitcher.test.tsx`
Expected: PASS.

```bash
npx @biomejs/biome check --write src/renderer
npm run lint
git add -A
git commit -m "feat: active-project store, project switcher band, project-scoped EnvPicker & History"
```

---

## Task 6: PlatformIcon + Hub grouped by tunnel + responsive filter

**Files:**
- Create: `src/renderer/components/PlatformIcon.tsx`
- Modify: `src/renderer/screens/HubLibrary.tsx`
- Modify: `src/renderer/theme.css` (tunnel section classes)
- Test: `tests/renderer/hubLibrary.test.tsx` (rewrite), `tests/renderer/filters.test.tsx` (update), `tests/renderer/platformIcon.test.tsx` (new)

**Interfaces:**
- Consumes: `useAppStore` (`activeProjectId`), `window.api.listScenariosByProject`, `window.api.listTunnels`, `window.api.runScenario(projectId, tunnelId, scenarioId, envId)`.
- Produces (`PlatformIcon.tsx`): `<PlatformIcon platform={Platform} size={number} />` — globe for `web`, monitor for `responsive`, phone for `mobile`. Default export not used; named export `PlatformIcon`.

- [ ] **Step 1: Write the failing PlatformIcon test**

Create `tests/renderer/platformIcon.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformIcon } from "../../src/renderer/components/PlatformIcon";

describe("PlatformIcon", () => {
	it("rend une icône avec un libellé accessible par plateforme", () => {
		const { getByLabelText, rerender } = render(
			<PlatformIcon platform="web" size={16} />,
		);
		expect(getByLabelText("Web")).toBeTruthy();
		rerender(<PlatformIcon platform="responsive" size={16} />);
		expect(getByLabelText("Responsive")).toBeTruthy();
		rerender(<PlatformIcon platform="mobile" size={16} />);
		expect(getByLabelText("Mobile")).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/platformIcon.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement PlatformIcon**

Create `src/renderer/components/PlatformIcon.tsx`:

```tsx
import type { Platform } from "../../shared/types";

const LABELS: Record<Platform, string> = {
	web: "Web",
	responsive: "Responsive",
	mobile: "Mobile",
};

export function PlatformIcon({
	platform,
	size = 16,
}: {
	platform: Platform;
	size?: number;
}): JSX.Element {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 2,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		role: "img" as const,
		"aria-label": LABELS[platform],
	};

	if (platform === "web") {
		// Globe: circle + single meridian (ISO maquette).
		return (
			<svg {...common}>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
			</svg>
		);
	}
	if (platform === "responsive") {
		// Monitor: screen + stand.
		return (
			<svg {...common}>
				<rect x="3" y="4" width="18" height="12" rx="1.5" />
				<path d="M9 20h6M12 16v4" />
			</svg>
		);
	}
	// Mobile: phone.
	return (
		<svg {...common}>
			<rect x="6" y="2" width="12" height="20" rx="2.5" />
			<line x1="12" y1="18" x2="12.01" y2="18" />
		</svg>
	);
}
```

- [ ] **Step 4: Run the PlatformIcon test to verify it passes**

Run: `npm test -- tests/renderer/platformIcon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite the Hub test**

Replace the entire contents of `tests/renderer/hubLibrary.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HubLibrary from "../../src/renderer/screens/HubLibrary";
import { useAppStore } from "../../src/renderer/store";

const scenarios = [
	{
		id: "login",
		projectId: "default",
		tunnelId: "general",
		name: "Connexion",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "local",
		tags: [],
		specFile: "login.spec.ts",
		createdAt: "2026-06-24T00:00:00Z",
		lastRun: { status: "never" },
	},
	{
		id: "search",
		projectId: "default",
		tunnelId: "booking",
		name: "Recherche train",
		platform: "responsive",
		browser: "chromium",
		defaultEnvironmentId: "local",
		tags: [],
		specFile: "search.spec.ts",
		createdAt: "2026-06-24T00:00:00Z",
		lastRun: { status: "passed", at: "2026-06-24T01:00:00Z", durationMs: 900 },
	},
];

const tunnels = [
	{
		id: "general",
		projectId: "default",
		name: "Général",
		order: 0,
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "booking",
		projectId: "default",
		name: "Réservation",
		order: 1,
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listScenariosByProject: vi.fn().mockResolvedValue(scenarios),
		listTunnels: vi.fn().mockResolvedValue(tunnels),
		listEnvironments: vi.fn().mockResolvedValue([]),
		runScenario: vi.fn().mockResolvedValue({ runId: "run-1" }),
	} as unknown as typeof window.api;
	useAppStore.setState({ activeProjectId: "default", scenarios: [] });
});
afterEach(() => {
	vi.clearAllMocks();
});

describe("HubLibrary", () => {
	it("affiche les scénarios groupés par tunnel", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		expect(await screen.findByText("Général")).toBeTruthy();
		expect(screen.getByText("Réservation")).toBeTruthy();
		expect(screen.getByText("Connexion")).toBeTruthy();
		expect(screen.getByText("Recherche train")).toBeTruthy();
	});

	it("Lancer appelle runScenario avec projectId et tunnelId", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		const launchButtons = screen.getAllByRole("button", { name: /lancer/i });
		fireEvent.click(launchButtons[0]);
		await waitFor(() =>
			expect(window.api.runScenario as unknown as ReturnType<typeof vi.fn>)
				.toHaveBeenCalled(),
		);
		const call = (
			window.api.runScenario as unknown as ReturnType<typeof vi.fn>
		).mock.calls[0];
		// (projectId, tunnelId, scenarioId, envId)
		expect(call[0]).toBe("default");
		expect(call[1]).toBe("general");
		expect(call[2]).toBe("login");
	});
});
```

- [ ] **Step 6: Run the Hub test to verify it fails**

Run: `npm test -- tests/renderer/hubLibrary.test.tsx`
Expected: FAIL — Hub still uses `listScenarios()` / old run signature / no grouping.

- [ ] **Step 7: Rewrite HubLibrary**

Replace the entire contents of `src/renderer/screens/HubLibrary.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Platform, Scenario, Tunnel } from "../../shared/types";
import { EnvPicker } from "../components/EnvPicker";
import { PlatformIcon } from "../components/PlatformIcon";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store";

function formatAt(at?: string): string {
	if (!at) return "—";
	return new Date(at).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDuration(ms?: number): string {
	if (ms == null) return "—";
	return `${(ms / 1000).toFixed(1)}s`;
}

const PLATFORM_LABELS: Record<Platform, string> = {
	web: "Web",
	responsive: "Responsive",
	mobile: "Mobile",
};

type Filter = "all" | Platform;

function MagnifierIcon(): JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
	);
}

export default function HubLibrary(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const scenarios = useAppStore((s) => s.scenarios);
	const setScenarios = useAppStore((s) => s.setScenarios);

	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [envId, setEnvId] = useState("");
	const [creatingTunnel, setCreatingTunnel] = useState(false);
	const [tunnelName, setTunnelName] = useState("");

	async function reload(): Promise<void> {
		if (!activeProjectId) return;
		const [s, t] = await Promise.all([
			window.api.listScenariosByProject(activeProjectId),
			window.api.listTunnels(activeProjectId),
		]);
		setScenarios(s);
		setTunnels(t);
	}

	useEffect(() => {
		reload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeProjectId]);

	async function handleLancer(scenario: Scenario): Promise<void> {
		const env = envId || scenario.defaultEnvironmentId;
		const { runId } = await window.api.runScenario(
			scenario.projectId,
			scenario.tunnelId,
			scenario.id,
			env,
		);
		navigate(`/run/${runId}`);
	}

	async function handleCreateTunnel(): Promise<void> {
		const name = tunnelName.trim();
		if (!name || !activeProjectId) return;
		await window.api.createTunnel({ projectId: activeProjectId, name });
		setTunnelName("");
		setCreatingTunnel(false);
		await reload();
	}

	const visible = useMemo(
		() =>
			scenarios.filter((s) => {
				if (filter !== "all" && s.platform !== filter) return false;
				if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
					return false;
				return true;
			}),
		[scenarios, filter, query],
	);

	const groups = useMemo(
		() =>
			tunnels.map((t) => ({
				tunnel: t,
				items: visible.filter((s) => s.tunnelId === t.id),
			})),
		[tunnels, visible],
	);

	return (
		<div style={{ padding: "2rem" }}>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					marginBottom: "1.5rem",
				}}
			>
				<div>
					<h1 className="otl-hub-title">Scénarios</h1>
					<p className="otl-hub-subtitle">
						Vos parcours de test, prêts à lancer
					</p>
				</div>
				<div style={{ display: "flex", gap: "0.5rem" }}>
					<button
						type="button"
						className="otl-tab"
						onClick={() => setCreatingTunnel((v) => !v)}
					>
						+ Tunnel
					</button>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() => navigate("/scenarios/new")}
					>
						+ Nouveau scénario
					</button>
				</div>
			</div>

			{creatingTunnel && (
				<div
					style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
				>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du tunnel"
						value={tunnelName}
						onChange={(e) => setTunnelName(e.target.value)}
					/>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={handleCreateTunnel}
					>
						Créer
					</button>
				</div>
			)}

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.75rem",
					marginBottom: "1rem",
				}}
			>
				<EnvPicker value={envId} onChange={setEnvId} />
				<div style={{ display: "flex", gap: "0.5rem" }}>
					{(["all", "web", "responsive", "mobile"] as Filter[]).map((f) => (
						<button
							key={f}
							type="button"
							className={filter === f ? "otl-tab otl-tab--active" : "otl-tab"}
							onClick={() => setFilter(f)}
						>
							{f === "all" ? "Tous" : PLATFORM_LABELS[f]}
						</button>
					))}
				</div>
			</div>

			<div className="otl-search" style={{ marginBottom: "1rem" }}>
				<span className="otl-search__icon">
					<MagnifierIcon />
				</span>
				<input
					type="text"
					className="otl-search__input"
					placeholder="Rechercher…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>

			{groups.every((g) => g.items.length === 0) ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>
			) : (
				groups
					.filter((g) => g.items.length > 0)
					.map((g) => (
						<section key={g.tunnel.id} className="otl-tunnel-group">
							<h2 className="otl-tunnel-group__title">
								{g.tunnel.name}
								<span className="otl-tunnel-group__count">
									{g.items.length}
								</span>
							</h2>
							<div className="otl-card-list">
								{g.items.map((scenario) => (
									<div
										key={scenario.id}
										data-testid={`scenario-card-${scenario.id}`}
										className={
											scenario.lastRun.status === "failed"
												? "otl-card otl-card--failed"
												: "otl-card"
										}
									>
										<div className="otl-card__icon">
											<PlatformIcon platform={scenario.platform} size={16} />
										</div>
										<div className="otl-card__body">
											<div className="otl-card__name">{scenario.name}</div>
											<div className="otl-card__meta">
												{PLATFORM_LABELS[scenario.platform]} ·{" "}
												{scenario.browser}
											</div>
										</div>
										<div className="otl-card__right">
											<StatusBadge status={scenario.lastRun.status} />
											<span className="otl-card__time">
												{formatAt(scenario.lastRun.at)}
											</span>
											<span className="otl-card__duration">
												{formatDuration(scenario.lastRun.durationMs)}
											</span>
											<button
												type="button"
												className="otl-btn-launch"
												onClick={() => handleLancer(scenario)}
											>
												Lancer
											</button>
										</div>
									</div>
								))}
							</div>
						</section>
					))
			)}
		</div>
	);
}
```

- [ ] **Step 8: Update the filters test**

Open `tests/renderer/filters.test.tsx`. It mocks `window.api.runScenario` and likely `listScenarios`. Update its mock to provide `listScenariosByProject` and `listTunnels` (mirroring the Hub test's shape), set `useAppStore.setState({ activeProjectId: "default" })`, give the scenarios `projectId`/`tunnelId`, and update the `runScenario` assertion to the 4-arg form (`projectId`, `tunnelId`, `scenarioId`, `envId`). If the test asserts platform filtering, add a `responsive` scenario and assert it is hidden when the `Web` filter is active and shown under the `Responsive` filter.

- [ ] **Step 9: Add tunnel-group CSS**

In `src/renderer/theme.css`, append:

```css
.otl-tunnel-group {
	margin-bottom: 1.5rem;
}
.otl-tunnel-group__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 13px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--otl-text-2);
	margin: 0 0 0.6rem;
}
.otl-tunnel-group__count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 18px;
	height: 18px;
	padding: 0 5px;
	border-radius: 9px;
	background: var(--otl-hover);
	color: var(--otl-text-3);
	font-size: 11px;
	font-weight: 600;
}
```

- [ ] **Step 10: Run Hub + filters + icon tests, lint, commit**

Run: `npm test -- tests/renderer/hubLibrary.test.tsx tests/renderer/filters.test.tsx tests/renderer/platformIcon.test.tsx`
Expected: PASS.

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat: Hub grouped by tunnel, PlatformIcon (ISO maquette), responsive filter"
```

---

## Task 7: New Scenario — tunnel selector + responsive platform card

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx`
- Test: `tests/renderer/newScenario.test.tsx` (update)

**Interfaces:**
- Consumes: `useAppStore` (`activeProjectId`), `window.api.listTunnels(projectId)`, `window.api.startRecording({name, browser, environmentId, projectId, tunnelId})`.
- Produces: a recording request carrying `projectId` (active project) and `tunnelId` (selected, defaulting to the first tunnel).

- [ ] **Step 1: Update the New Scenario test**

Open `tests/renderer/newScenario.test.tsx`. Update the mock so `window.api` includes `listTunnels` (returns a `general` tunnel) and `listEnvironments`, and set `useAppStore.setState({ activeProjectId: "default" })`. Then update the `startRecording` assertion. Replace the assertion block that checks `toHaveBeenCalledWith` so it expects the project/tunnel fields:

```tsx
expect(window.api.startRecording).toHaveBeenCalledWith(
	expect.objectContaining({
		name: expect.any(String),
		browser: "chromium",
		projectId: "default",
		tunnelId: "general",
	}),
);
```

Add the tunnel/env/store setup to `beforeEach` (merge with existing mocks):

```tsx
import { useAppStore } from "../../src/renderer/store";
// ...
window.api = {
	...window.api,
	listTunnels: vi.fn().mockResolvedValue([
		{
			id: "general",
			projectId: "default",
			name: "Général",
			order: 0,
			createdAt: "2026-06-24T00:00:00Z",
		},
	]),
	listEnvironments: vi.fn().mockResolvedValue([]),
	startRecording: vi.fn().mockResolvedValue({ recordingId: "rec-1" }),
	stopRecording: vi.fn().mockResolvedValue({}),
} as unknown as typeof window.api;
useAppStore.setState({ activeProjectId: "default" });
```

(Keep the existing test's name input + button interactions intact — only the API shape and assertion change.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/newScenario.test.tsx`
Expected: FAIL — `startRecording` called without `projectId`/`tunnelId`; `listTunnels` not invoked.

- [ ] **Step 3: Update NewScenario**

In `src/renderer/screens/NewScenario.tsx`, make these changes:

Update imports and add tunnel/platform state. Replace the top of the component (imports + state):

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Platform, Tunnel } from "../../shared/types";
import { EnvPicker } from "../components/EnvPicker";
import { useAppStore } from "../store";

export default function NewScenario(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);

	const [name, setName] = useState("");
	const [envId, setEnvId] = useState("");
	const [recordingId, setRecordingId] = useState<string | null>(null);
	const [platform, setPlatform] = useState<Platform>("web");
	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [tunnelId, setTunnelId] = useState("");

	useEffect(() => {
		if (!activeProjectId) return;
		window.api.listTunnels(activeProjectId).then((t) => {
			setTunnels(t);
			setTunnelId((current) => current || t[0]?.id || "");
		});
	}, [activeProjectId]);
```

Update `handleStart` to pass project/tunnel:

```tsx
	async function handleStart() {
		const { recordingId: id } = await window.api.startRecording({
			name,
			browser: "chromium",
			environmentId: envId || "local",
			projectId: activeProjectId,
			tunnelId: tunnelId || "general",
		});
		setRecordingId(id);
	}
```

Add a **Tunnel selector** field. Insert this block just before the `{/* Scenario name */}` field:

```tsx
					{/* Tunnel */}
					<div>
						<div className="otl-field-label">Tunnel</div>
						<select
							className="otl-select"
							aria-label="Tunnel"
							value={tunnelId}
							onChange={(e) => setTunnelId(e.target.value)}
						>
							{tunnels.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</div>
```

Add a **Responsive** platform card. Insert this between the Web card and the Mobile card (after the Web `</button>`, before the Mobile `<div ...otl-platform--disabled>`):

```tsx
						{/* Responsive card */}
						<button
							type="button"
							className={`otl-platform${platform === "responsive" ? " otl-platform--selected" : ""}`}
							onClick={() => setPlatform("responsive")}
						>
							<span className="otl-platform__icon">
								<svg
									width="30"
									height="30"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<rect x="3" y="4" width="18" height="12" rx="1.5" />
									<path d="M9 20h6M12 16v4" />
								</svg>
							</span>
							<span className="otl-platform__labels">
								<span className="otl-platform__name">Responsive</span>
								<span className="otl-platform__sub">Playwright</span>
							</span>
							<span className="otl-platform__check">
								{platform === "responsive" ? (
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="var(--otl-cyan)"
										aria-hidden="true"
									>
										<circle cx="12" cy="12" r="10" />
										<path
											d="M8 12l3 3 5-5"
											stroke="#fff"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											fill="none"
										/>
									</svg>
								) : (
									<span className="otl-platform__hollow-circle" />
								)}
							</span>
						</button>
```

> Note: the recorder always saves `platform: "web"` today (Phase 2). The selected `platform` state drives the UI selection; persisting `responsive` from the recorder is deferred to the responsive-runner iteration. Keep the Web card's `onClick={() => setPlatform("web")}` so the existing Web selection still works. Do NOT remove the existing Web/Mobile cards.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/renderer/newScenario.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer/screens/NewScenario.tsx tests/renderer/newScenario.test.tsx
npm run lint
git add -A
git commit -m "feat: New Scenario tunnel selector + responsive platform card"
```

---

## Task 8: Projects screen + sidebar item + route + title

**Files:**
- Create: `src/renderer/screens/Projects.tsx`
- Modify: `src/renderer/App.tsx` (route)
- Modify: `src/renderer/components/Sidebar.tsx` (nav item)
- Modify: `src/renderer/components/TitleBar.tsx` (page title)
- Modify: `src/renderer/theme.css` (projects screen classes)
- Test: `tests/renderer/projects.test.tsx` (new), `tests/renderer/sidebar.test.tsx` (update), `tests/renderer/titleBar.test.tsx` (update)

**Interfaces:**
- Consumes: `window.api.listProjects`, `window.api.createProject`, `window.api.updateProject`, `window.api.deleteProject`, `window.api.saveEnvironment`, `window.api.deleteEnvironment`; `useAppStore.loadProjects`.
- Produces: a default-exported `<Projects />` screen at route `/projects`.

- [ ] **Step 1: Write the failing Projects test**

Create `tests/renderer/projects.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Projects from "../../src/renderer/screens/Projects";
import { useAppStore } from "../../src/renderer/store";

const initial = [
	{
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listProjects: vi.fn().mockResolvedValue(initial),
		createProject: vi.fn().mockResolvedValue({
			id: "web",
			name: "Site Web",
			description: "",
			environments: [],
			createdAt: "2026-06-24T00:00:00Z",
		}),
		updateProject: vi.fn().mockResolvedValue(undefined),
		deleteProject: vi.fn().mockResolvedValue(undefined),
		saveEnvironment: vi.fn().mockResolvedValue(undefined),
		deleteEnvironment: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects: initial, activeProjectId: "default" });
});
afterEach(() => {
	vi.clearAllMocks();
});

describe("Projects screen", () => {
	it("liste les projets existants", async () => {
		render(
			<MemoryRouter>
				<Projects />
			</MemoryRouter>,
		);
		expect(await screen.findByText("Projet par défaut")).toBeTruthy();
	});
	it("crée un projet via le formulaire", async () => {
		render(
			<MemoryRouter>
				<Projects />
			</MemoryRouter>,
		);
		fireEvent.change(screen.getByPlaceholderText(/nom du projet/i), {
			target: { value: "Site Web" },
		});
		fireEvent.click(screen.getByRole("button", { name: /créer le projet/i }));
		await waitFor(() =>
			expect(
				window.api.createProject as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith({ name: "Site Web", description: "" }),
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/projects.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the Projects screen**

Create `src/renderer/screens/Projects.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Environment, Project } from "../../shared/types";
import { useAppStore } from "../store";

export default function Projects(): JSX.Element {
	const loadProjects = useAppStore((s) => s.loadProjects);
	const [projects, setProjects] = useState<Project[]>([]);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [selectedId, setSelectedId] = useState("");

	async function refresh(): Promise<void> {
		const list = await window.api.listProjects();
		setProjects(list);
		await loadProjects();
		if (!selectedId && list[0]) setSelectedId(list[0].id);
	}

	useEffect(() => {
		refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function handleCreate(): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) return;
		await window.api.createProject({ name: trimmed, description });
		setName("");
		setDescription("");
		await refresh();
	}

	async function handleDelete(id: string): Promise<void> {
		await window.api.deleteProject(id);
		if (selectedId === id) setSelectedId("");
		await refresh();
	}

	const selected = projects.find((p) => p.id === selectedId) ?? null;

	return (
		<div style={{ padding: "2rem" }}>
			<h1 className="otl-hub-title">Projets</h1>
			<p className="otl-hub-subtitle">
				Organisez vos tests par projet et gérez leurs environnements.
			</p>

			<div className="otl-projects-create">
				<input
					type="text"
					className="otl-input"
					placeholder="Nom du projet"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<input
					type="text"
					className="otl-input"
					placeholder="Description (optionnel)"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={handleCreate}
				>
					Créer le projet
				</button>
			</div>

			<div className="otl-card-list" style={{ marginTop: "1.25rem" }}>
				{projects.map((p) => (
					<div key={p.id} className="otl-card">
						<div className="otl-card__body">
							<div className="otl-card__name">{p.name}</div>
							<div className="otl-card__meta">
								{p.description || "—"} · {p.environments.length} env.
							</div>
						</div>
						<div className="otl-card__right">
							<button
								type="button"
								className="otl-tab"
								onClick={() => setSelectedId(p.id)}
							>
								Environnements
							</button>
							<button
								type="button"
								className="otl-btn-stop"
								onClick={() => handleDelete(p.id)}
								disabled={projects.length <= 1}
							>
								Supprimer
							</button>
						</div>
					</div>
				))}
			</div>

			{selected && (
				<EnvironmentEditor
					project={selected}
					onChanged={refresh}
				/>
			)}
		</div>
	);
}

function EnvironmentEditor({
	project,
	onChanged,
}: {
	project: Project;
	onChanged: () => Promise<void>;
}): JSX.Element {
	const [label, setLabel] = useState("");
	const [baseURL, setBaseURL] = useState("");

	async function addEnv(): Promise<void> {
		const trimmed = label.trim();
		if (!trimmed) return;
		const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		const env: Environment = { id, label: trimmed, baseURL, variables: {} };
		await window.api.saveEnvironment(project.id, env);
		setLabel("");
		setBaseURL("");
		await onChanged();
	}

	async function removeEnv(envId: string): Promise<void> {
		await window.api.deleteEnvironment(project.id, envId);
		await onChanged();
	}

	return (
		<div className="otl-env-editor">
			<h2 className="otl-tunnel-group__title">
				Environnements — {project.name}
			</h2>
			<div className="otl-card-list">
				{project.environments.map((e) => (
					<div key={e.id} className="otl-card">
						<div className="otl-card__body">
							<div className="otl-card__name">{e.label}</div>
							<div className="otl-card__meta">{e.baseURL}</div>
						</div>
						<div className="otl-card__right">
							<button
								type="button"
								className="otl-btn-stop"
								onClick={() => removeEnv(e.id)}
								disabled={project.environments.length <= 1}
							>
								Supprimer
							</button>
						</div>
					</div>
				))}
			</div>
			<div className="otl-projects-create" style={{ marginTop: "0.75rem" }}>
				<input
					type="text"
					className="otl-input"
					placeholder="Libellé (ex : Production)"
					value={label}
					onChange={(e) => setLabel(e.target.value)}
				/>
				<input
					type="text"
					className="otl-input"
					placeholder="https://…"
					value={baseURL}
					onChange={(e) => setBaseURL(e.target.value)}
				/>
				<button type="button" className="otl-btn-primary" onClick={addEnv}>
					Ajouter
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run the Projects test to verify it passes**

Run: `npm test -- tests/renderer/projects.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the route**

In `src/renderer/App.tsx`, add the import and route. Add to imports:

```tsx
import Projects from "./screens/Projects";
```

Add inside `<Routes>` (after the `/reports` route):

```tsx
								<Route path="/projects" element={<Projects />} />
```

- [ ] **Step 6: Add the sidebar item**

In `src/renderer/components/Sidebar.tsx`, add a `projects` icon to the `icons` object:

```tsx
	projects: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	),
```

Add a nav item to `navItems` (after "Scénarios"):

```tsx
	{
		label: "Projets",
		icon: icons.projects,
		to: "/projects",
		match: (p) => p.startsWith("/projects"),
	},
```

- [ ] **Step 7: Update the sidebar test**

Open `tests/renderer/sidebar.test.tsx`. Add an assertion that the "Projets" item renders and navigates to `/projects`. If the test counts nav items, bump the expected count by 1. Minimal addition:

```tsx
expect(screen.getByText("Projets")).toBeTruthy();
```

- [ ] **Step 8: Add the page title**

In `src/renderer/components/TitleBar.tsx`, add a case in `pageTitle` before the final `return`:

```ts
	if (pathname.startsWith("/projects")) return "Projets";
```

- [ ] **Step 9: Update the titleBar test**

Open `tests/renderer/titleBar.test.tsx`. Add a case asserting the title for `/projects` is "Projets", mirroring the existing route-title cases in that file.

- [ ] **Step 10: Add Projects screen CSS**

In `src/renderer/theme.css`, append:

```css
.otl-projects-create {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	align-items: center;
}
.otl-env-editor {
	margin-top: 1.5rem;
	padding-top: 1.25rem;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 11: Run the full suite + build, lint, commit**

Run: `npm test && npm run build`
Expected: ALL tests PASS and the production build succeeds (main + preload + renderer type-check clean).

```bash
npx @biomejs/biome check --write src tests
npm run lint
git add -A
git commit -m "feat: Projects management screen, sidebar item, route & page title"
```

---

## Self-Review

**1. Spec coverage:**
- §2.1 types (`responsive`, `Project`, `Tunnel`, scenario fields) → Task 1.
- §2.2 invariants (default tunnel/env, deletion guards) → Tasks 1 (stores) + 3 (seed) + 4 (createProject).
- §3 storage layout (nested, reports stay in runs/) → Tasks 1-2; reports untouched (Global Constraints).
- §4 migration (idempotent, default project/tunnel, data preserved) → Task 3.
- §5.1 stores scoped + environmentStore removed → Tasks 1-2.
- §5.2 IPC surface + scoped `scenario:run` + recording opts → Task 4.
- §6.1 renderer store (`activeProjectId`, persisted) → Task 5.
- §6.2 switcher band → Task 5.
- §6.3 Hub grouped by tunnel + responsive filter + "+ Tunnel" → Task 6.
- §6.4 PlatformIcon ISO maquette → Task 6.
- §6.5 New Scenario tunnel + responsive card → Task 7.
- §6.6 Projects screen + sidebar + route → Task 8.
- §6.7 page title `/projects` → Task 8.
- §7 tests → each task is TDD.
- Out-of-scope (batch run, real responsive/mobile execution) → not implemented; noted in Task 7 and Global Constraints.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". The two `eslint-disable-next-line react-hooks/exhaustive-deps` comments are intentional (single-shot loads keyed on `activeProjectId`/mount), not placeholders.

**3. Type consistency:** `Project`/`Tunnel`/`Scenario` field names are identical across Tasks 1-8. `getScenario(projectId, tunnelId, id)`, `updateLastRun(projectId, tunnelId, id, lastRun)`, `runScenario(projectId, tunnelId, scenarioId, envId)`, `startRecording({…, projectId, tunnelId})`, `createProject({name, description})`, `createTunnel({projectId, name})` are used with the same signatures in the stores, handlers, preload, `api.d.ts`, and renderer. `getEnvironment(projectId, envId)` is consistent between projectStore, recorder, and register.

**Known cross-task note for the executor:** after Task 4, `npm run build` may fail on renderer screens still using old API signatures (they are fixed in Tasks 5-8). This is expected; Task 4's Step 8 says to gate on `npm test -- tests/main` and defer the full build. The full build is green again at Task 8 Step 11.
