# Phase A — Projets & navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de la liste des projets le point d'entrée de l'app, avec création de projet (environnements + URLs validées), édition des environnements, et une barre de contexte (fil d'Ariane + switch projet + environnement actif), au niveau de finition de la maquette.

**Architecture:** Renderer React (HashRouter, Zustand) + IPC Electron. La création de projet enrichie passe par l'IPC `createProject` (environnements optionnels). Le renderer gagne des écrans dédiés (`/projects`, `/projects/new`, `/projects/:id/environments`), une barre de contexte remplaçant le switcher, et un environnement actif par projet dans le store.

**Tech Stack:** Electron (electron-vite), React + TypeScript, React Router (HashRouter), Zustand, Vitest + @testing-library/react, Biome.

## Global Constraints

- Source de vérité visuelle : maquette « Ouigo Test Lab » sections 01–02 (Projets, Création, Édition env) + la barre de contexte de la section 03.
- Route par défaut : `/` redirige vers `/projects`. Sidebar : **Projets** en premier.
- Création projet = écran dédié `/projects/new` ; édition env = écran dédié `/projects/:id/environments` (pas d'inline).
- Validation URL : une URL d'environnement est **requise** et doit commencer par `http://` ou `https://`. Bouton « Créer le projet » désactivé tant que le nom est vide ou qu'une ligne est invalide.
- L'édition d'un environnement **ne régénère pas son `id`** (upsert via `saveEnvironment`).
- L'environnement **actif** est par projet (`activeEnvByProject`), persisté localStorage, et utilisé au lancement d'un scénario.
- Biome : tabs, LF ; `npm run lint` doit être clean après chaque tâche.
- Tests : `window.api` mocké, `useAppStore.setState(...)` pour le projet/env actif, nettoyage `Reflect.deleteProperty` côté main. Ne pas casser la suite existante.
- `new Date().toISOString()` autorisé (process main).

---

## File Structure

- `src/main/ipc/handlers.ts` — `handleCreateProject` accepte des environnements optionnels.
- `src/preload/index.ts`, `src/renderer/api.d.ts` — signature `createProject` étendue.
- `src/renderer/store.ts` — `activeEnvByProject` + `setActiveEnv`.
- `src/renderer/screens/Projects.tsx` — **réécrit** : liste de cartes + état vide (plus de formulaire inline).
- `src/renderer/screens/NewProject.tsx` — **nouveau** : écran de création (env + validation).
- `src/renderer/screens/ProjectEnvironments.tsx` — **nouveau** : écran d'édition des environnements.
- `src/renderer/components/ProjectContextBar.tsx` — **nouveau** (remplace `ProjectSwitcher.tsx`) : fil d'Ariane + dropdown projet + picker environnement actif.
- `src/renderer/components/ProjectSwitcher.tsx` — **supprimé**.
- `src/renderer/App.tsx` — routes + redirection par défaut + barre de contexte.
- `src/renderer/components/Sidebar.tsx` — Projets en premier.
- `src/renderer/screens/HubLibrary.tsx` — lancement avec l'environnement actif.
- `src/renderer/theme.css` — styles des nouveaux écrans/barre.

---

## Task 1: IPC `createProject` accepte des environnements

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/api.d.ts`
- Test: `tests/main/handlers.test.ts`

**Interfaces:**
- Produces: `createProject(input: { name: string; description: string; environments?: Array<{ label: string; baseURL: string }> }): Promise<Project>`. Si `environments` est fourni et non vide, le handler construit les `Environment` (id = slug unique du libellé, `variables: {}`) ; sinon il garde `defaultEnvironments()`. Le tunnel « Général » reste créé.
- Consumes (Task 4-5): cette signature.

- [ ] **Step 1: Write the failing test**

Add to `tests/main/handlers.test.ts` (suivre le setup `OTL_WORKSPACE` existant) :

```ts
it("handleCreateProject construit les environnements fournis (libellé + URL)", () => {
	const p = handleCreateProject({
		name: "Démo",
		description: "",
		environments: [
			{ label: "Préprod", baseURL: "https://preprod.demo" },
			{ label: "Recette", baseURL: "https://recette.demo" },
		],
	});
	expect(p.environments.map((e) => e.label)).toEqual(["Préprod", "Recette"]);
	expect(p.environments.map((e) => e.baseURL)).toEqual([
		"https://preprod.demo",
		"https://recette.demo",
	]);
	// ids dérivés et uniques
	expect(new Set(p.environments.map((e) => e.id)).size).toBe(2);
});

it("handleCreateProject sans environnements garde les défauts", () => {
	const p = handleCreateProject({ name: "Démo2", description: "" });
	expect(p.environments.map((e) => e.id)).toEqual(["preprod", "recette"]);
});

it("handleCreateProject déduplique les ids d'environnement", () => {
	const p = handleCreateProject({
		name: "Démo3",
		description: "",
		environments: [
			{ label: "Prod", baseURL: "https://a" },
			{ label: "Prod", baseURL: "https://b" },
		],
	});
	expect(p.environments[0].id).not.toBe(p.environments[1].id);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/main/handlers.test.ts`
Expected: FAIL (le 3e argument `environments` n'est pas géré ; types/valeurs ne correspondent pas).

- [ ] **Step 3: Implement**

In `src/main/ipc/handlers.ts`, add a helper above `handleCreateProject` and rewrite the function:

```ts
function buildEnvironments(
	rows: Array<{ label: string; baseURL: string }>,
): Environment[] {
	const used = new Set<string>();
	return rows.map((row) => {
		const base = slugify(row.label);
		let id = base;
		let n = 2;
		while (used.has(id)) id = `${base}-${n++}`;
		used.add(id);
		return { id, label: row.label, baseURL: row.baseURL, variables: {} };
	});
}

export function handleCreateProject(input: {
	name: string;
	description: string;
	environments?: Array<{ label: string; baseURL: string }>;
}): Project {
	const id = uniqueProjectId(slugify(input.name));
	const now = new Date().toISOString();
	const environments =
		input.environments && input.environments.length > 0
			? buildEnvironments(input.environments)
			: defaultEnvironments();
	const project: Project = {
		id,
		name: input.name,
		description: input.description,
		environments,
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
```

(`Environment` est déjà importé depuis `../../shared/types` dans ce fichier ; sinon l'ajouter.)

- [ ] **Step 4: Update preload + api.d.ts**

`src/preload/index.ts` — remplacer la méthode `createProject` :

```ts
	createProject(input: {
		name: string;
		description: string;
		environments?: Array<{ label: string; baseURL: string }>;
	}) {
		return ipcRenderer.invoke("project:create", input);
	},
```

`src/renderer/api.d.ts` — remplacer la déclaration `createProject` :

```ts
	createProject(input: {
		name: string;
		description: string;
		environments?: Array<{ label: string; baseURL: string }>;
	}): Promise<Project>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/main/handlers.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx @biomejs/biome check --write src/main/ipc/handlers.ts src/preload/index.ts src/renderer/api.d.ts tests/main/handlers.test.ts
npm run lint
git add -A
git commit -m "feat(A1): createProject accepts environments (label + URL)"
```

---

## Task 2: Store — environnement actif par projet

**Files:**
- Modify: `src/renderer/store.ts`
- Test: `tests/renderer/store.test.ts` (créer)

**Interfaces:**
- Produces: `activeEnvByProject: Record<string, string>`, `setActiveEnv(projectId: string, envId: string): void` (persiste sous `otl.activeEnvByProject`). Lecture via sélecteur `useAppStore((s) => s.activeEnvByProject[projectId])`.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/store.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../src/renderer/store";

afterEach(() => {
	localStorage.clear();
	useAppStore.setState({ activeEnvByProject: {} });
});

describe("store activeEnvByProject", () => {
	it("setActiveEnv enregistre l'env actif d'un projet et persiste", () => {
		useAppStore.getState().setActiveEnv("p1", "preprod");
		expect(useAppStore.getState().activeEnvByProject.p1).toBe("preprod");
		expect(localStorage.getItem("otl.activeEnvByProject")).toContain("preprod");
	});
	it("setActiveEnv n'écrase pas les autres projets", () => {
		useAppStore.getState().setActiveEnv("p1", "preprod");
		useAppStore.getState().setActiveEnv("p2", "recette");
		expect(useAppStore.getState().activeEnvByProject).toEqual({
			p1: "preprod",
			p2: "recette",
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/store.test.ts`
Expected: FAIL (`setActiveEnv` / `activeEnvByProject` n'existent pas).

- [ ] **Step 3: Implement**

In `src/renderer/store.ts`, add persistence helpers and extend the state. Add after the `ACTIVE_KEY` block:

```ts
const ENV_KEY = "otl.activeEnvByProject";

function readActiveEnvMap(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}") as Record<
			string,
			string
		>;
	} catch {
		return {};
	}
}

function writeActiveEnvMap(map: Record<string, string>): void {
	try {
		localStorage.setItem(ENV_KEY, JSON.stringify(map));
	} catch {
		/* ignore */
	}
}
```

Extend the `AppState` interface:

```ts
	activeEnvByProject: Record<string, string>;
	setActiveEnv: (projectId: string, envId: string) => void;
```

In the `create(...)` body, add:

```ts
	activeEnvByProject: readActiveEnvMap(),
	setActiveEnv: (projectId, envId) => {
		const next = { ...get().activeEnvByProject, [projectId]: envId };
		writeActiveEnvMap(next);
		set({ activeEnvByProject: next });
	},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/renderer/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer/store.ts tests/renderer/store.test.ts
npm run lint
git add -A
git commit -m "feat(A2): active environment per project in store"
```

---

## Task 3: Écran « Nouveau projet » (`/projects/new`)

**Files:**
- Create: `src/renderer/screens/NewProject.tsx`
- Modify: `src/renderer/App.tsx` (route)
- Modify: `src/renderer/theme.css` (styles `otl-envrow`, `otl-create`)
- Test: `tests/renderer/newProject.test.tsx`

**Interfaces:**
- Consumes: `window.api.createProject({ name, description, environments })` (Task 1), `useAppStore` (`setActiveProjectId`, `loadProjects`).
- Produces: route `/projects/new` rendering `<NewProject />` (default export).

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/newProject.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewProject from "../../src/renderer/screens/NewProject";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	window.api = {
		createProject: vi.fn().mockResolvedValue({
			id: "demo",
			name: "Démo",
			description: "",
			environments: [],
			createdAt: "2026-06-24T00:00:00Z",
		}),
		listProjects: vi.fn().mockResolvedValue([]),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects: [], activeProjectId: "" });
});
afterEach(() => {
	vi.clearAllMocks();
});

function renderScreen() {
	render(
		<MemoryRouter>
			<NewProject />
		</MemoryRouter>,
	);
}

describe("NewProject", () => {
	it("désactive Créer tant qu'une URL est invalide", () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		// Lignes Préprod/Recette présentes mais URLs vides → bouton désactivé
		const create = screen.getByRole("button", { name: /créer le projet/i });
		expect(create).toBeDisabled();
	});

	it("crée le projet avec les environnements saisis puis navigue dans le projet", async () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		const urlInputs = screen.getAllByPlaceholderText("https://…");
		fireEvent.change(urlInputs[0], {
			target: { value: "https://preprod.demo" },
		});
		fireEvent.change(urlInputs[1], {
			target: { value: "https://recette.demo" },
		});
		const create = screen.getByRole("button", { name: /créer le projet/i });
		await waitFor(() => expect(create).not.toBeDisabled());
		fireEvent.click(create);
		await waitFor(() =>
			expect(
				window.api.createProject as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith({
				name: "Démo",
				description: "",
				environments: [
					{ label: "Préprod", baseURL: "https://preprod.demo" },
					{ label: "Recette", baseURL: "https://recette.demo" },
				],
			}),
		);
		await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/scenarios"));
		expect(useAppStore.getState().activeProjectId).toBe("demo");
	});

	it("rejette une URL sans http(s)://", () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		const urlInputs = screen.getAllByPlaceholderText("https://…");
		fireEvent.change(urlInputs[0], { target: { value: "ftp://x" } });
		fireEvent.change(urlInputs[1], { target: { value: "https://ok" } });
		expect(
			screen.getByRole("button", { name: /créer le projet/i }),
		).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/newProject.test.tsx`
Expected: FAIL (module `NewProject` absent).

- [ ] **Step 3: Implement the screen**

Create `src/renderer/screens/NewProject.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

interface EnvRow {
	label: string;
	baseURL: string;
}

function isValidUrl(u: string): boolean {
	return /^https?:\/\//.test(u.trim());
}

export default function NewProject(): JSX.Element {
	const navigate = useNavigate();
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const loadProjects = useAppStore((s) => s.loadProjects);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [rows, setRows] = useState<EnvRow[]>([
		{ label: "Préprod", baseURL: "" },
		{ label: "Recette", baseURL: "" },
	]);

	function updateRow(i: number, patch: Partial<EnvRow>): void {
		setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
	}
	function addRow(): void {
		setRows((rs) => [...rs, { label: "", baseURL: "" }]);
	}
	function removeRow(i: number): void {
		setRows((rs) => rs.filter((_, idx) => idx !== i));
	}

	// Lignes "réelles" : au moins un libellé ou une URL renseignés.
	const filled = rows.filter((r) => r.label.trim() || r.baseURL.trim());
	const missingUrls = filled.filter((r) => !r.baseURL.trim()).length;
	const invalidUrls = filled.filter(
		(r) => r.baseURL.trim() && !isValidUrl(r.baseURL),
	).length;
	const allLabelled = filled.every((r) => r.label.trim());
	const canCreate =
		name.trim().length > 0 &&
		filled.length > 0 &&
		missingUrls === 0 &&
		invalidUrls === 0 &&
		allLabelled;

	async function handleCreate(): Promise<void> {
		if (!canCreate) return;
		const project = await window.api.createProject({
			name: name.trim(),
			description,
			environments: filled.map((r) => ({
				label: r.label.trim(),
				baseURL: r.baseURL.trim(),
			})),
		});
		await loadProjects();
		setActiveProjectId(project.id);
		navigate("/scenarios");
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					← Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Nouveau projet</span>
			</nav>

			<h1 className="otl-hub-title">Nouveau projet</h1>

			<div className="otl-create">
				<div>
					<div className="otl-field-label">Nom du projet</div>
					<input
						className="otl-input"
						placeholder="Nom du projet"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Description</div>
					<textarea
						className="otl-input otl-textarea"
						placeholder="Description (optionnel)"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<div>
					<div className="otl-create__envhead">
						<span className="otl-field-label">Environnements</span>
						{missingUrls > 0 && (
							<span className="otl-create__warn">
								{missingUrls} URL manquante{missingUrls > 1 ? "s" : ""}
							</span>
						)}
					</div>
					<p className="otl-hub-subtitle">
						Chaque environnement (Préprod, Recette…) pointe vers une URL Web
						testable.
					</p>

					{rows.map((row, i) => {
						const urlBad =
							row.baseURL.trim() === ""
								? (row.label.trim() ? "missing" : "")
								: !isValidUrl(row.baseURL)
									? "invalid"
									: "";
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
							<div className="otl-envrow" key={i}>
								<input
									className="otl-input otl-envrow__label"
									placeholder="Libellé"
									value={row.label}
									onChange={(e) => updateRow(i, { label: e.target.value })}
								/>
								<div className="otl-envrow__urlwrap">
									<input
										className={`otl-input${urlBad ? " otl-input--error" : ""}`}
										placeholder="https://…"
										value={row.baseURL}
										onChange={(e) => updateRow(i, { baseURL: e.target.value })}
									/>
									{urlBad === "missing" && (
										<span className="otl-envrow__err">
											L'URL est requise pour cet environnement.
										</span>
									)}
									{urlBad === "invalid" && (
										<span className="otl-envrow__err">
											URL invalide — elle doit commencer par https://
										</span>
									)}
								</div>
								<button
									type="button"
									className="otl-envrow__remove"
									aria-label="Supprimer l'environnement"
									onClick={() => removeRow(i)}
								>
									–
								</button>
							</div>
						);
					})}
					<button type="button" className="otl-tab" onClick={addRow}>
						+ Ajouter un environnement
					</button>
				</div>

				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canCreate}
						onClick={handleCreate}
					>
						Créer le projet
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/projects")}
					>
						Annuler
					</button>
					{!canCreate && (
						<span className="otl-create__hint">
							Renseignez une URL valide pour chaque environnement.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Add the route**

In `src/renderer/App.tsx`, add the import and route. Import:

```tsx
import NewProject from "./screens/NewProject";
```

Add inside `<Routes>` (after the `/projects` route):

```tsx
								<Route path="/projects/new" element={<NewProject />} />
```

- [ ] **Step 5: Add minimal styles**

In `src/renderer/theme.css`, append:

```css
.otl-screen { padding: 2rem; }
.otl-breadcrumb { display:flex; align-items:center; gap:.5rem; font-size:12.5px; color:var(--otl-text-3); margin-bottom:1rem; }
.otl-breadcrumb__link { background:none; border:none; color:var(--otl-text-2); cursor:pointer; font-size:12.5px; }
.otl-breadcrumb__link:hover { color:var(--otl-text); }
.otl-breadcrumb__sep { opacity:.5; }
.otl-create { display:flex; flex-direction:column; gap:18px; max-width:640px; }
.otl-textarea { height:auto; min-height:64px; padding:10px 12px; resize:vertical; }
.otl-create__envhead { display:flex; align-items:center; justify-content:space-between; }
.otl-create__warn { font-size:11px; font-weight:600; color:var(--otl-danger-soft); }
.otl-envrow { display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; }
.otl-envrow__label { flex:0 0 160px; }
.otl-envrow__urlwrap { flex:1; display:flex; flex-direction:column; gap:4px; }
.otl-input--error { border-color: var(--otl-danger); }
.otl-envrow__err { font-size:11px; color:var(--otl-danger-soft); }
.otl-envrow__remove { width:34px; height:40px; border-radius:9px; border:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.4); color:var(--otl-text-3); cursor:pointer; }
.otl-create__actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.otl-create__hint { font-size:12px; color:var(--otl-text-3); }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/renderer/newProject.test.tsx`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat(A3): Nouveau projet screen (environments + URL validation)"
```

---

## Task 4: Écran « Environnements » (`/projects/:id/environments`)

**Files:**
- Create: `src/renderer/screens/ProjectEnvironments.tsx`
- Modify: `src/renderer/App.tsx` (route)
- Modify: `src/renderer/theme.css` (styles `otl-envtable`)
- Test: `tests/renderer/projectEnvironments.test.tsx`

**Interfaces:**
- Consumes: `window.api.getProject(id)`, `saveEnvironment(projectId, env)`, `deleteEnvironment(projectId, envId)`.
- Produces: route `/projects/:id/environments` rendering `<ProjectEnvironments />` (default export).

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/projectEnvironments.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectEnvironments from "../../src/renderer/screens/ProjectEnvironments";

const project = {
	id: "ouigo",
	name: "Ouigo.com",
	description: "",
	environments: [
		{ id: "preprod", label: "Préprod", baseURL: "https://preprod.ouigo.com", variables: {} },
		{ id: "recette", label: "Recette", baseURL: "https://recette.ouigo.com", variables: {} },
	],
	createdAt: "2026-06-24T00:00:00Z",
};

beforeEach(() => {
	window.api = {
		getProject: vi.fn().mockResolvedValue(project),
		saveEnvironment: vi.fn().mockResolvedValue(undefined),
		deleteEnvironment: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
});
afterEach(() => vi.clearAllMocks());

function renderAt() {
	render(
		<MemoryRouter initialEntries={["/projects/ouigo/environments"]}>
			<Routes>
				<Route
					path="/projects/:id/environments"
					element={<ProjectEnvironments />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("ProjectEnvironments", () => {
	it("liste les environnements du projet", async () => {
		renderAt();
		expect(await screen.findByDisplayValue("Préprod")).toBeTruthy();
		expect(screen.getByDisplayValue("https://recette.ouigo.com")).toBeTruthy();
	});

	it("enregistre une URL modifiée via saveEnvironment (même id)", async () => {
		renderAt();
		const url = (await screen.findByDisplayValue(
			"https://preprod.ouigo.com",
		)) as HTMLInputElement;
		fireEvent.change(url, { target: { value: "https://pp.ouigo.com" } });
		fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
		await waitFor(() =>
			expect(
				window.api.saveEnvironment as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith(
				"ouigo",
				expect.objectContaining({ id: "preprod", baseURL: "https://pp.ouigo.com" }),
			),
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/projectEnvironments.test.tsx`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement the screen**

Create `src/renderer/screens/ProjectEnvironments.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Environment, Project } from "../../shared/types";

export default function ProjectEnvironments(): JSX.Element {
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const [project, setProject] = useState<Project | null>(null);
	const [rows, setRows] = useState<Environment[]>([]);

	async function load(): Promise<void> {
		const p = await window.api.getProject(id);
		setProject(p);
		setRows(p.environments);
	}
	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	function updateRow(envId: string, patch: Partial<Environment>): void {
		setRows((rs) => rs.map((r) => (r.id === envId ? { ...r, ...patch } : r)));
	}
	function addRow(): void {
		const base = "env";
		let nid = base;
		let n = 2;
		const ids = new Set(rows.map((r) => r.id));
		while (ids.has(nid)) nid = `${base}-${n++}`;
		setRows((rs) => [
			...rs,
			{ id: nid, label: "Nouvel environnement", baseURL: "", variables: {} },
		]);
	}

	async function save(): Promise<void> {
		// Upsert chaque ligne (id conservé), sans régénérer l'id.
		for (const r of rows) {
			await window.api.saveEnvironment(id, r);
		}
		await load();
	}

	async function remove(envId: string): Promise<void> {
		await window.api.deleteEnvironment(id, envId);
		await load();
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					← Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>{project?.name ?? "…"}</span>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Environnements</span>
			</nav>

			<div className="otl-create__envhead">
				<h1 className="otl-hub-title">Environnements</h1>
				<button type="button" className="otl-tab" onClick={addRow}>
					+ Ajouter
				</button>
			</div>
			<p className="otl-hub-subtitle">
				Modifiez le libellé et l'URL de chaque environnement du projet{" "}
				{project?.name ?? ""}.
			</p>

			<div className="otl-envtable">
				<div className="otl-envtable__head">
					<span className="otl-field-label">Libellé</span>
					<span className="otl-field-label">URL Web</span>
					<span />
				</div>
				{rows.map((r) => (
					<div className="otl-envrow" key={r.id}>
						<input
							className="otl-input otl-envrow__label"
							value={r.label}
							onChange={(e) => updateRow(r.id, { label: e.target.value })}
						/>
						<input
							className="otl-input otl-envrow__urlwrap"
							value={r.baseURL}
							onChange={(e) => updateRow(r.id, { baseURL: e.target.value })}
						/>
						<button
							type="button"
							className="otl-envrow__remove"
							aria-label="Supprimer l'environnement"
							disabled={rows.length <= 1}
							onClick={() => remove(r.id)}
						>
							–
						</button>
					</div>
				))}
			</div>

			<div className="otl-create__actions">
				<button type="button" className="otl-btn-primary" onClick={save}>
					Enregistrer les modifications
				</button>
				<button
					type="button"
					className="otl-tab"
					onClick={() => navigate("/projects")}
				>
					Annuler
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Add the route + styles**

`src/renderer/App.tsx` — import + route:

```tsx
import ProjectEnvironments from "./screens/ProjectEnvironments";
```

```tsx
								<Route
									path="/projects/:id/environments"
									element={<ProjectEnvironments />}
								/>
```

`src/renderer/theme.css` — append:

```css
.otl-envtable { display:flex; flex-direction:column; gap:8px; max-width:720px; margin-top:1rem; }
.otl-envtable__head { display:flex; gap:8px; padding:0 2px; }
.otl-envtable__head .otl-field-label:first-child { flex:0 0 160px; }
.otl-envtable__head .otl-field-label:nth-child(2) { flex:1; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/renderer/projectEnvironments.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat(A4): Project environments edit screen (label + URL)"
```

---

## Task 5: Refonte de l'accueil Projets (cartes + état vide)

**Files:**
- Modify (rewrite): `src/renderer/screens/Projects.tsx`
- Modify: `src/renderer/theme.css` (styles cartes projet)
- Test: `tests/renderer/projects.test.tsx` (réécrit)

**Interfaces:**
- Consumes: `window.api.listProjects()`, `window.api.listScenariosByProject(projectId)`, `window.api.deleteProject(id)`, `useAppStore` (`setActiveProjectId`, `loadProjects`, `projects`).
- Produces: route `/projects` rendering la liste (default export `Projects`).

- [ ] **Step 1: Rewrite the test**

Replace `tests/renderer/projects.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Projects from "../../src/renderer/screens/Projects";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

const projects = [
	{
		id: "ouigo",
		name: "Ouigo.com",
		description: "Site de réservation grand public.",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
			{ id: "recette", label: "Recette", baseURL: "https://r", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	navigateMock.mockReset();
	window.api = {
		listProjects: vi.fn().mockResolvedValue(projects),
		listScenariosByProject: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
		deleteProject: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
	useAppStore.setState({
		projects,
		activeProjectId: "ouigo",
		setActiveProjectId: useAppStore.getState().setActiveProjectId,
	});
});
afterEach(() => vi.clearAllMocks());

function renderScreen() {
	render(
		<MemoryRouter>
			<Projects />
		</MemoryRouter>,
	);
}

describe("Projects landing", () => {
	it("affiche une carte projet avec compteurs", async () => {
		renderScreen();
		expect(await screen.findByText("Ouigo.com")).toBeTruthy();
		expect(screen.getByText(/2 environnements/i)).toBeTruthy();
		expect(screen.getByText(/2 scénarios/i)).toBeTruthy();
	});
	it("« Nouveau projet » navigue vers /projects/new", async () => {
		renderScreen();
		await screen.findByText("Ouigo.com");
		fireEvent.click(screen.getByRole("button", { name: /nouveau projet/i }));
		expect(navigateMock).toHaveBeenCalledWith("/projects/new");
	});
	it("« Ouvrir » rend le projet actif et va aux scénarios", async () => {
		renderScreen();
		await screen.findByText("Ouigo.com");
		fireEvent.click(screen.getByRole("button", { name: /ouvrir/i }));
		await waitFor(() =>
			expect(useAppStore.getState().activeProjectId).toBe("ouigo"),
		);
		expect(navigateMock).toHaveBeenCalledWith("/scenarios");
	});
	it("affiche l'état vide quand aucun projet", async () => {
		(window.api.listProjects as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		useAppStore.setState({ projects: [] });
		renderScreen();
		expect(await screen.findByText(/aucun projet pour l'instant/i)).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/projects.test.tsx`
Expected: FAIL (l'écran actuel a un formulaire inline, pas de cartes/Ouvrir/état vide).

- [ ] **Step 3: Rewrite the screen**

Replace the entire contents of `src/renderer/screens/Projects.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project } from "../../shared/types";
import { useAppStore } from "../store";

export default function Projects(): JSX.Element {
	const navigate = useNavigate();
	const projects = useAppStore((s) => s.projects);
	const loadProjects = useAppStore((s) => s.loadProjects);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const [counts, setCounts] = useState<Record<string, number>>({});

	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	useEffect(() => {
		let cancelled = false;
		Promise.all(
			projects.map(async (p) => {
				const list = await window.api.listScenariosByProject(p.id);
				return [p.id, list.length] as const;
			}),
		).then((pairs) => {
			if (!cancelled) setCounts(Object.fromEntries(pairs));
		});
		return () => {
			cancelled = true;
		};
	}, [projects]);

	function open(p: Project): void {
		setActiveProjectId(p.id);
		navigate("/scenarios");
	}
	async function remove(id: string): Promise<void> {
		await window.api.deleteProject(id);
		await loadProjects();
	}

	return (
		<div className="otl-screen">
			<div className="otl-projects-header">
				<div>
					<h1 className="otl-hub-title">Projets</h1>
					<p className="otl-hub-subtitle">
						Chaque projet regroupe ses environnements et ses scénarios de test.
					</p>
				</div>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={() => navigate("/projects/new")}
				>
					+ Nouveau projet
				</button>
			</div>

			{projects.length === 0 ? (
				<div className="otl-empty">
					<div className="otl-empty__icon" aria-hidden="true">
						<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
							<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
						</svg>
					</div>
					<div className="otl-empty__title">Aucun projet pour l'instant</div>
					<p className="otl-empty__sub">
						Créez votre premier projet, ajoutez ses environnements (Préprod,
						Recette…) puis enregistrez vos scénarios de test.
					</p>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() => navigate("/projects/new")}
					>
						+ Créer mon premier projet
					</button>
				</div>
			) : (
				<div className="otl-project-grid">
					{projects.map((p) => (
						<div key={p.id} className="otl-card otl-project-card">
							<div className="otl-project-card__top">
								<span className="otl-project-card__icon" aria-hidden="true">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
										<circle cx="12" cy="12" r="9" />
										<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
									</svg>
								</span>
								<div className="otl-project-card__head">
									<div className="otl-card__name">{p.name}</div>
									<div className="otl-card__meta">{p.description || "—"}</div>
								</div>
								<button
									type="button"
									className="otl-project-card__del"
									aria-label="Supprimer le projet"
									disabled={projects.length <= 1}
									onClick={() => remove(p.id)}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
										<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" strokeLinejoin="round" />
									</svg>
								</button>
							</div>
							<div className="otl-project-card__pills">
								<span className="otl-pill">{p.environments.length} environnements</span>
								<span className="otl-pill">{counts[p.id] ?? 0} scénarios</span>
							</div>
							<div className="otl-project-card__actions">
								<button type="button" className="otl-btn-launch" onClick={() => open(p)}>
									Ouvrir ›
								</button>
								<button
									type="button"
									className="otl-tab"
									onClick={() => navigate(`/projects/${p.id}/environments`)}
								>
									Environnements
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Add styles**

In `src/renderer/theme.css`, append:

```css
.otl-projects-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.5rem; }
.otl-project-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; }
.otl-project-card { flex-direction:column; align-items:stretch; gap:12px; }
.otl-project-card__top { display:flex; align-items:flex-start; gap:10px; }
.otl-project-card__icon { width:34px; height:34px; display:flex; align-items:center; justify-content:center; border-radius:10px; background:rgba(0,201,177,0.12); color:var(--otl-cyan); }
.otl-project-card__head { flex:1; }
.otl-project-card__del { background:none; border:none; color:var(--otl-text-3); cursor:pointer; padding:4px; }
.otl-project-card__del:hover:not(:disabled) { color:var(--otl-danger-soft); }
.otl-project-card__del:disabled { opacity:.3; cursor:not-allowed; }
.otl-project-card__pills { display:flex; gap:8px; }
.otl-pill { display:inline-flex; align-items:center; padding:3px 9px; border-radius:8px; background:var(--otl-hover); color:var(--otl-text-2); font-size:11.5px; }
.otl-project-card__actions { display:flex; gap:8px; }
.otl-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:4rem 1rem; color:var(--otl-text-3); }
.otl-empty__icon { color:var(--otl-text-3); opacity:.6; }
.otl-empty__title { font-size:16px; font-weight:600; color:var(--otl-text); }
.otl-empty__sub { max-width:380px; font-size:13px; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/renderer/projects.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat(A5): Projects landing redesign (cards, counts, empty state)"
```

---

## Task 6: Barre de contexte (remplace le switcher)

**Files:**
- Create: `src/renderer/components/ProjectContextBar.tsx`
- Delete: `src/renderer/components/ProjectSwitcher.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/theme.css`
- Test: `tests/renderer/projectContextBar.test.tsx`
- Delete: `tests/renderer/projectSwitcher.test.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`projects`, `activeProjectId`, `setActiveProjectId`, `activeEnvByProject`, `setActiveEnv`), `useLocation`/`useNavigate`.
- Produces: `<ProjectContextBar />`. Masquée sur les routes `/projects*`. Sinon : fil d'Ariane `Projets / <projet> ⌄` (dropdown = switch projet) + sélecteur **Environnement** (lit `project.environments`, écrit `setActiveEnv`).

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/projectContextBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectContextBar } from "../../src/renderer/components/ProjectContextBar";
import { useAppStore } from "../../src/renderer/store";

const projects = [
	{
		id: "ouigo",
		name: "Ouigo.com",
		description: "",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
			{ id: "recette", label: "Recette", baseURL: "https://r", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	useAppStore.setState({ projects, activeProjectId: "ouigo", activeEnvByProject: {} });
});
afterEach(() => {
	localStorage.clear();
	useAppStore.setState({ activeEnvByProject: {} });
});

function renderAt(path: string) {
	render(
		<MemoryRouter initialEntries={[path]}>
			<ProjectContextBar />
		</MemoryRouter>,
	);
}

describe("ProjectContextBar", () => {
	it("est masquée sur /projects", () => {
		const { container } = render(
			<MemoryRouter initialEntries={["/projects"]}>
				<ProjectContextBar />
			</MemoryRouter>,
		);
		expect(container.querySelector(".otl-ctxbar")).toBeNull();
	});
	it("affiche le projet actif et un sélecteur d'environnement sur /scenarios", () => {
		renderAt("/scenarios");
		expect(screen.getByLabelText(/projet actif/i)).toBeTruthy();
		expect(screen.getByLabelText(/environnement actif/i)).toBeTruthy();
	});
	it("choisir un environnement met à jour activeEnvByProject", () => {
		renderAt("/scenarios");
		fireEvent.change(screen.getByLabelText(/environnement actif/i), {
			target: { value: "recette" },
		});
		expect(useAppStore.getState().activeEnvByProject.ouigo).toBe("recette");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/renderer/projectContextBar.test.tsx`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement the component**

Create `src/renderer/components/ProjectContextBar.tsx`:

```tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

export function ProjectContextBar(): JSX.Element | null {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
	const setActiveEnv = useAppStore((s) => s.setActiveEnv);

	if (pathname.startsWith("/projects")) return null;

	const project = projects.find((p) => p.id === activeProjectId) ?? null;
	const envId = activeEnvByProject[activeProjectId] ?? "";

	return (
		<div className="otl-ctxbar">
			<div className="otl-ctxbar__crumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<select
					className="otl-select otl-ctxbar__project"
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
			</div>
			<div className="otl-ctxbar__env">
				<span className="otl-ctxbar__envlabel">Environnement</span>
				<select
					className="otl-select"
					aria-label="Environnement actif"
					value={envId}
					onChange={(e) => setActiveEnv(activeProjectId, e.target.value)}
				>
					<option value="">Par défaut</option>
					{(project?.environments ?? []).map((env) => (
						<option key={env.id} value={env.id}>
							{env.label}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Swap in App.tsx and delete the old component/test**

In `src/renderer/App.tsx`, replace the `ProjectSwitcher` import and usage:

```tsx
import { ProjectContextBar } from "./components/ProjectContextBar";
```

```tsx
				<TitleBar />
				<ProjectContextBar />
```

Then delete the old files:

```bash
git rm src/renderer/components/ProjectSwitcher.tsx tests/renderer/projectSwitcher.test.tsx
```

- [ ] **Step 5: Styles**

In `src/renderer/theme.css`, append:

```css
.otl-ctxbar { display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:8px 18px; border-bottom:1px solid rgba(255,255,255,0.06); background:var(--otl-sidebar-bg); }
.otl-ctxbar__crumb { display:flex; align-items:center; gap:.5rem; }
.otl-ctxbar__project { font-weight:600; }
.otl-ctxbar__env { display:flex; align-items:center; gap:.5rem; }
.otl-ctxbar__envlabel { font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--otl-text-2); }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/renderer/projectContextBar.test.tsx`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat(A6): project context bar (breadcrumb + project switch + active env)"
```

---

## Task 7: Route par défaut, sidebar, et lancement avec l'env actif

**Files:**
- Modify: `src/renderer/App.tsx` (redirection par défaut)
- Modify: `src/renderer/components/Sidebar.tsx` (Projets en premier)
- Modify: `src/renderer/screens/HubLibrary.tsx` (lancement avec env actif)
- Test: `tests/renderer/sidebar.test.tsx`, `tests/renderer/hubLibrary.test.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`activeEnvByProject`).
- Produces: `/` redirige vers `/projects` ; `Sidebar` liste Projets en premier ; `handleLancer` du Hub utilise `activeEnvByProject[projectId] || envId || scenario.defaultEnvironmentId`.

- [ ] **Step 1: Update default route**

In `src/renderer/App.tsx`, change the index redirect:

```tsx
								<Route path="/" element={<Navigate to="/projects" replace />} />
```

- [ ] **Step 2: Reorder the sidebar**

In `src/renderer/components/Sidebar.tsx`, move the `Projets` item to the top of `navItems` (before `Scénarios`). The array becomes:

```tsx
const navItems: NavItem[] = [
	{
		label: "Projets",
		icon: icons.projects,
		to: "/projects",
		match: (p) => p === "/" || p.startsWith("/projects"),
	},
	{
		label: "Scénarios",
		icon: icons.scenarios,
		to: "/scenarios",
		match: (p) => p.startsWith("/scenarios"),
	},
	{
		label: "Exéc.",
		icon: icons.exec,
		to: "/scenarios",
		match: (p) => p.startsWith("/run"),
	},
	{
		label: "Rapports",
		icon: icons.reports,
		to: "/reports",
		match: (p) => p.startsWith("/reports") || p.startsWith("/report"),
	},
];
```

- [ ] **Step 3: Hub launch uses active env — write the failing test**

In `tests/renderer/hubLibrary.test.tsx`, add to the existing `window.api` mock a `listTunnels`/`listScenariosByProject` already present; set an active env and assert it is used. Add this test inside the existing `describe`:

```tsx
it("lance avec l'environnement actif du projet", async () => {
	useAppStore.setState({ activeEnvByProject: { default: "recette" } });
	render(
		<MemoryRouter>
			<HubLibrary />
		</MemoryRouter>,
	);
	await screen.findByText("Connexion");
	fireEvent.click(screen.getAllByRole("button", { name: /lancer/i })[0]);
	await waitFor(() =>
		expect(window.api.runScenario as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled(),
	);
	const call = (window.api.runScenario as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
	expect(call[3]).toBe("recette"); // envId
});
```

(Le fichier importe déjà `useAppStore`, `fireEvent`, `waitFor`. Sinon, les ajouter aux imports.)

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- tests/renderer/hubLibrary.test.tsx`
Expected: FAIL (le Hub utilise `envId || defaultEnvironmentId`, pas l'env actif).

- [ ] **Step 5: Implement the Hub change**

In `src/renderer/screens/HubLibrary.tsx`, read the active env from the store and use it in `handleLancer`. Add near the other store selectors:

```tsx
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
```

In `handleLancer`, change the env resolution:

```tsx
	async function handleLancer(scenario: Scenario): Promise<void> {
		const env =
			activeEnvByProject[scenario.projectId] ||
			envId ||
			scenario.defaultEnvironmentId;
		const { runId } = await window.api.runScenario(
			scenario.projectId,
			scenario.tunnelId,
			scenario.id,
			env,
		);
		navigate(`/run/${runId}`);
	}
```

- [ ] **Step 6: Update the sidebar test**

In `tests/renderer/sidebar.test.tsx`, assert order: Projets appears before Scénarios. Add:

```tsx
it("affiche Projets en premier", () => {
	render(
		<MemoryRouter>
			<Sidebar />
		</MemoryRouter>,
	);
	const labels = screen
		.getAllByText(/Projets|Scénarios|Exéc\.|Rapports/)
		.map((n) => n.textContent);
	expect(labels.indexOf("Projets")).toBeLessThan(labels.indexOf("Scénarios"));
});
```

(Match the file's existing render/import style; it already renders `<Sidebar />` inside `MemoryRouter`.)

- [ ] **Step 7: Run the tests**

Run: `npm test -- tests/renderer/hubLibrary.test.tsx tests/renderer/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npm run lint
git add -A
git commit -m "feat(A7): default route /projects, Projets-first sidebar, launch with active env"
```

---

## Task 8: Vérification complète + polish + cleanup

**Files:**
- Modify (if needed): `src/renderer/theme.css`
- Test: `tests/e2e/projects.e2e.ts` (nouveau, Playwright `_electron`)

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Full suite + build green**

Run: `npm test && npm run build`
Expected: ALL green. Fix any regression in the screens touched. (Notamment vérifier que `tests/renderer/filters.test.tsx` et les autres tests Hub passent toujours — ils ne dépendent pas de l'env actif par défaut.)

- [ ] **Step 2: Write a focused Electron E2E for the create-project flow**

Create `tests/e2e/projects.e2e.ts` (suivre le harnais de `tests/e2e/*.e2e.ts` existant : lancement via `_electron`, `OTL_WORKSPACE`/`OTL_FIXTURES`/`OTL_CODEGEN` comme les autres e2e). Le test :

```ts
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let workspace: string;
const REPO = resolve(__dirname, "../..");

test.beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "otl-e2e-proj-"));
});
test.afterEach(() => rmSync(workspace, { recursive: true, force: true }));

test("création d'un projet avec environnements puis ouverture", async () => {
	const app = await electron.launch({
		args: [join(REPO, "out/main/index.js")],
		env: {
			...process.env,
			OTL_WORKSPACE: workspace,
			OTL_FIXTURES: join(REPO, "fixtures"),
		},
	});
	const win = await app.firstWindow();

	// L'accueil est la liste des projets (le seed crée "Projet par défaut").
	await win.getByRole("button", { name: /nouveau projet/i }).click();
	await win.getByPlaceholder("Nom du projet").fill("Démo E2E");
	const urls = win.getByPlaceholder("https://…");
	await urls.nth(0).fill("https://preprod.demo");
	await urls.nth(1).fill("https://recette.demo");
	await win.getByRole("button", { name: /créer le projet/i }).click();

	// On entre dans le projet (Hub). Retour aux projets via la barre de contexte.
	await win.getByRole("button", { name: "Projets" }).click();
	await expect(win.getByText("Démo E2E")).toBeVisible();
	await expect(win.getByText(/2 environnements/i)).toBeVisible();

	await app.close();
});
```

(Adapter les sélecteurs/chemins au harnais e2e existant : si les autres e2e construisent l'app autrement ou utilisent un helper de lancement, le réutiliser.)

- [ ] **Step 3: Run the E2E**

Run: `npm run build && npm run test:e2e -- projects`
Expected: PASS. (Si l'e2e est instable sur le timing de navigation, ajouter des `await expect(...).toBeVisible()` avant les clics, jamais de `waitForTimeout` arbitraire.)

- [ ] **Step 4: Cleanup check**

Vérifier qu'il ne reste aucune référence à `ProjectSwitcher` (`grep -r ProjectSwitcher src tests` → vide) ni à l'ancien formulaire inline de `Projects.tsx`. Supprimer tout import/CSS mort.

- [ ] **Step 5: Final commit**

```bash
npx @biomejs/biome check --write src tests
npm run lint
git add -A
git commit -m "test(A8): e2e create-project flow + polish & cleanup"
```

---

## Self-Review

**1. Spec coverage (spec §3, §4, §9 — Phase A) :**
- Route défaut `/projects` + sidebar Projets-first → Task 7. ✓
- Accueil cartes + compteurs + état vide → Task 5. ✓
- Création projet écran dédié + env + validation URL → Task 3 (+ IPC Task 1). ✓
- Édition env écran dédié (libellé+URL, id non régénéré) → Task 4. ✓
- Barre de contexte (breadcrumb + dropdown projet + env actif) → Task 6. ✓
- Env actif par projet + utilisé au lancement → Task 2 (store) + Task 7 (Hub). ✓
- Cohérence visuelle + cleanup → Tasks 3–6 (styles) + Task 8. ✓
- Vérification E2E + démo → Task 8 (la démo réelle/captures est faite par le contrôleur après le loop).
- Phase B (groupes/Hub) et Phase C (auto-run) : hors de ce plan (plans séparés).

**2. Placeholder scan :** aucun TBD/TODO. Les `eslint-disable`/`biome-ignore` sont intentionnels (chargements one-shot, clés positionnelles de lignes d'env).

**3. Type consistency :** `createProject({name, description, environments?})` identique en Task 1 (handler/preload/api.d.ts) et consommé en Task 3/5. `setActiveEnv(projectId, envId)` / `activeEnvByProject` identiques Task 2 ↔ 6 ↔ 7. `saveEnvironment(projectId, env)` (id conservé) Task 4. Routes `/projects`, `/projects/new`, `/projects/:id/environments` cohérentes Tasks 3/4/5/6/7.
