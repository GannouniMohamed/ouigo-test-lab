# Phase B — Hub & Groupes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Hub so scenarios are organized by colored *groupes* (the `tunnel` entity, relabeled in the UI), with a group filter, per-group status breakdowns, richer scenario metas (browser · step count · relative time), and full create/edit/delete of groups.

**Architecture:** Electron-vite 3-layer (main/preload/renderer). Extend the `Tunnel` type with `color`/`description` and `LastRun` with `stepCount`; the tunnel store backfills defaults on read (soft migration, no file rewrite). New IPC `tunnel:update`; extended `tunnel:create`. Renderer gets group-based filtering, two new screens (`NewGroupe`, `EditGroupe`), and extracted, testable formatting helpers.

**Tech Stack:** TypeScript, React + React Router (HashRouter), Zustand, Vitest + @testing-library/react, Playwright `_electron` for E2E, Biome.

## Global Constraints

- **IPC parity is mandatory**: every channel must match across `src/preload/index.ts` (contextBridge), `src/main/ipc/register.ts` (`ipcMain.handle`), `src/renderer/api.d.ts` (types), and the handler in `src/main/ipc/handlers.ts`. Channel name + payload shape identical in all four.
- **Entity name stays `tunnel`** in code (ids, files, types, channels). UI strings say **« Groupe »**. Do NOT rename the entity or migrate files.
- **`Tunnel.color` and `Tunnel.description` are REQUIRED** in the type. The store backfills missing values on read so the renderer always receives complete tunnels.
- **`DEFAULT_TUNNEL_COLOR = "#2f6bff"`** and the 8-color palette live in `src/shared/groups.ts` (shared by main backfill and renderer palette).
- **Biome formatting**: tabs for indentation, LF line endings. Run `npx @biomejs/biome check .` (whole tree) before every commit — the CI lint runs `biome check .`, not single-file.
- **E2E files are `*.spec.ts`** under `tests/e2e/` (NOT `.e2e.ts`), launched via Playwright `_electron`. Gate every navigation on `toBeVisible`; never use `waitForTimeout`.
- **`new Date().toISOString()`** is allowed in the main process.
- **Relative-time helper must be deterministic**: `formatRelative(at, now?)` takes an optional `now` (ms epoch) so tests inject the clock instead of depending on `Date.now()`.
- CI = `npm run lint`, `npm test`, `npm run build` (macOS/Ubuntu/Windows) + `npm run test:e2e`. There is no `tsc --noEmit` gate, but keep types honest.
- The app opens on `/projects`; the Hub is at `/scenarios` (reached via sidebar "Scénarios" or by opening a project). E2E that needs the Hub clicks the sidebar "Scénarios" button after load.

---

### Task 1: Model — Tunnel color/description, LastRun.stepCount, shared palette, store backfill

**Files:**
- Modify: `src/shared/types.ts` (extend `Tunnel`, `LastRun`)
- Create: `src/shared/groups.ts` (palette + default color)
- Modify: `src/main/stores/tunnelStore.ts` (backfill on read)
- Test: `tests/main/tunnelStore.test.ts` (backfill cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Tunnel` now has `color: string; description: string`. `LastRun` now has `stepCount?: number`. `src/shared/groups.ts` exports `DEFAULT_TUNNEL_COLOR: string` and `GROUP_COLORS: string[]`. `listTunnels`/`getTunnel` return tunnels with `color`/`description` always populated.

- [ ] **Step 1: Create the shared palette module**

Create `src/shared/groups.ts`:

```ts
// Preset palette for group (tunnel) colors. Shared by the main-process
// backfill and the renderer color picker so both agree on valid values.
export const GROUP_COLORS: string[] = [
	"#2f6bff", // bleu
	"#00c9b1", // cyan
	"#ff3366", // rose
	"#a855f7", // violet
	"#f59e0b", // ambre
	"#22c55e", // vert
	"#ec4899", // magenta
	"#64748b", // ardoise
];

export const DEFAULT_TUNNEL_COLOR: string = GROUP_COLORS[0];
```

- [ ] **Step 2: Extend the types**

In `src/shared/types.ts`, change `LastRun` (currently lines 6-10) to add `stepCount`:

```ts
export interface LastRun {
	status: LastRunStatus;
	at?: string;
	durationMs?: number;
	stepCount?: number;
}
```

And change `Tunnel` (currently lines 41-47) to add `color` and `description`:

```ts
export interface Tunnel {
	id: string;
	projectId: string;
	name: string;
	order: number;
	color: string;
	description: string;
	createdAt: string;
}
```

- [ ] **Step 3: Write the failing backfill tests**

In `tests/main/tunnelStore.test.ts`, add tests that a tunnel written WITHOUT `color`/`description` (legacy file) is read back WITH defaults. Use the existing test's workspace setup pattern (look at the top of the file for `OTL_WORKSPACE` / temp-dir setup and reuse it). Add:

```ts
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";

it("listTunnels rétro-remplit color/description pour les tunnels legacy", () => {
	// Write a legacy tunnel.json without color/description.
	const dir = join(workspace, "projects", "p1", "tunnels", "t-legacy");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "tunnel.json"),
		JSON.stringify({
			id: "t-legacy",
			projectId: "p1",
			name: "Legacy",
			order: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
		}),
		"utf-8",
	);
	const [t] = listTunnels("p1");
	expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
	expect(t.description).toBe("");
});

it("getTunnel rétro-remplit color/description", () => {
	const dir = join(workspace, "projects", "p2", "tunnels", "t-legacy2");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "tunnel.json"),
		JSON.stringify({
			id: "t-legacy2",
			projectId: "p2",
			name: "Legacy2",
			order: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
		}),
		"utf-8",
	);
	const t = getTunnel("p2", "t-legacy2");
	expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
	expect(t.description).toBe("");
});
```

(Match the imports already present at the top of the test file — `listTunnels`, `getTunnel`, `mkdirSync`, `writeFileSync`, `join`, and the `workspace` variable name used by the existing tests. If the existing tests name the temp dir differently, use that name.)

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/main/tunnelStore.test.ts`
Expected: FAIL — the two new tests fail because `color`/`description` are `undefined`.

- [ ] **Step 5: Implement the backfill**

In `src/main/stores/tunnelStore.ts`, import the default and add a normalizer, then apply it in `listTunnels` and `getTunnel`:

```ts
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";

function normalize(raw: Tunnel): Tunnel {
	return {
		...raw,
		color: raw.color ?? DEFAULT_TUNNEL_COLOR,
		description: raw.description ?? "",
	};
}
```

In `listTunnels`, change the push to:
```ts
results.push(normalize(JSON.parse(readFileSync(meta, "utf-8")) as Tunnel));
```
In `getTunnel`, change the return to:
```ts
return normalize(JSON.parse(readFileSync(meta, "utf-8")) as Tunnel);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/main/tunnelStore.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 7: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/shared/types.ts src/shared/groups.ts src/main/stores/tunnelStore.ts tests/main/tunnelStore.test.ts
git commit -m "feat(B1): Tunnel color/description + LastRun.stepCount + store backfill"
```

---

### Task 2: IPC — extend createTunnel, add updateTunnel (4-layer parity)

**Files:**
- Modify: `src/main/ipc/handlers.ts` (`handleCreateTunnel`, new `handleUpdateTunnel`)
- Modify: `src/main/ipc/register.ts` (extend `tunnel:create` payload type, add `tunnel:update`)
- Modify: `src/preload/index.ts` (`createTunnel` payload, new `updateTunnel`)
- Modify: `src/renderer/api.d.ts` (`createTunnel` payload, new `updateTunnel`)
- Test: `tests/main/handlers.test.ts` (create defaults + explicit, update preserves identity, update throws)

**Interfaces:**
- Consumes: `Tunnel` with `color`/`description` (Task 1); `DEFAULT_TUNNEL_COLOR` from `src/shared/groups.ts`; `getTunnel`/`saveTunnel` from the tunnel store.
- Produces:
  - `createTunnel(input: { projectId: string; name: string; color?: string; description?: string }): Promise<Tunnel>`
  - `updateTunnel(t: Tunnel): Promise<Tunnel>` — persists `name`/`color`/`description`, preserves `id`/`projectId`/`order`/`createdAt`.
  - Channel `tunnel:update`.

- [ ] **Step 1: Write the failing handler tests**

In `tests/main/handlers.test.ts` (reuse its workspace setup), add:

```ts
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";

it("handleCreateTunnel applique les défauts couleur/description", () => {
	const t = handleCreateTunnel({ projectId: "p1", name: "Sans couleur" });
	expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
	expect(t.description).toBe("");
});

it("handleCreateTunnel respecte couleur/description fournies", () => {
	const t = handleCreateTunnel({
		projectId: "p1",
		name: "Avec couleur",
		color: "#ff3366",
		description: "Parcours d'achat",
	});
	expect(t.color).toBe("#ff3366");
	expect(t.description).toBe("Parcours d'achat");
});

it("handleUpdateTunnel modifie name/color/description en préservant l'identité", () => {
	const created = handleCreateTunnel({ projectId: "p1", name: "Avant" });
	const updated = handleUpdateTunnel({
		...created,
		name: "Après",
		color: "#22c55e",
		description: "maj",
	});
	expect(updated.id).toBe(created.id);
	expect(updated.order).toBe(created.order);
	expect(updated.createdAt).toBe(created.createdAt);
	expect(updated.name).toBe("Après");
	expect(updated.color).toBe("#22c55e");
	expect(updated.description).toBe("maj");
	// persisted
	const reread = handleListTunnels("p1").find((x) => x.id === created.id);
	expect(reread?.name).toBe("Après");
	expect(reread?.color).toBe("#22c55e");
});

it("handleUpdateTunnel lève si le tunnel n'existe pas", () => {
	expect(() =>
		handleUpdateTunnel({
			id: "ghost",
			projectId: "p1",
			name: "x",
			order: 0,
			color: "#2f6bff",
			description: "",
			createdAt: "2026-01-01T00:00:00.000Z",
		}),
	).toThrow();
});
```

Ensure `handleUpdateTunnel` is added to the import from `../../src/main/ipc/handlers` at the top of the test (alongside `handleCreateTunnel`, `handleListTunnels`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/handlers.test.ts`
Expected: FAIL — `handleUpdateTunnel` is not exported; create-with-defaults assertions fail.

- [ ] **Step 3: Implement the handlers**

In `src/main/ipc/handlers.ts`, import the default color and `getTunnel`:
```ts
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
```
(and add `getTunnel` to the existing import from the tunnel store, which already imports `listTunnels`, `saveTunnel`, `deleteTunnel`).

Replace `handleCreateTunnel` (currently lines 131-146) with:
```ts
export function handleCreateTunnel(input: {
	projectId: string;
	name: string;
	color?: string;
	description?: string;
}): Tunnel {
	const id = uniqueTunnelId(input.projectId, slugify(input.name));
	const order = listTunnels(input.projectId).length;
	const tunnel: Tunnel = {
		id,
		projectId: input.projectId,
		name: input.name,
		order,
		color: input.color ?? DEFAULT_TUNNEL_COLOR,
		description: input.description ?? "",
		createdAt: new Date().toISOString(),
	};
	saveTunnel(tunnel);
	return tunnel;
}

export function handleUpdateTunnel(input: Tunnel): Tunnel {
	const existing = getTunnel(input.projectId, input.id); // throws if missing
	const updated: Tunnel = {
		...existing,
		name: input.name,
		color: input.color,
		description: input.description,
	};
	saveTunnel(updated);
	return updated;
}
```

- [ ] **Step 4: Wire IPC register**

In `src/main/ipc/register.ts`, update the tunnel block (currently around lines 77-87). Import `handleUpdateTunnel`. Change:
```ts
ipcMain.handle(
	"tunnel:create",
	(
		_e,
		input: {
			projectId: string;
			name: string;
			color?: string;
			description?: string;
		},
	) => handleCreateTunnel(input),
);
ipcMain.handle("tunnel:update", (_e, t: Tunnel) => handleUpdateTunnel(t));
```
(Leave `tunnel:list` and `tunnel:delete` unchanged. Ensure `Tunnel` is imported in register.ts — it already imports it for `project:update`; if not, add it.)

- [ ] **Step 5: Wire preload**

In `src/preload/index.ts`, update `createTunnel` and add `updateTunnel`:
```ts
createTunnel(input: {
	projectId: string;
	name: string;
	color?: string;
	description?: string;
}) {
	return ipcRenderer.invoke("tunnel:create", input);
},
updateTunnel(t: Tunnel) {
	return ipcRenderer.invoke("tunnel:update", t);
},
```
(If preload imports types, add `Tunnel`; if it uses inline structural types only, type `t` as the `Tunnel` shape via the import — check the file's existing convention and match it.)

- [ ] **Step 6: Wire api.d.ts**

In `src/renderer/api.d.ts`, update the tunnel section (around lines 35-40):
```ts
createTunnel(input: {
	projectId: string;
	name: string;
	color?: string;
	description?: string;
}): Promise<Tunnel>;
updateTunnel(t: Tunnel): Promise<Tunnel>;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/main/handlers.test.ts`
Expected: PASS.

- [ ] **Step 8: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/main/ipc/handlers.ts src/main/ipc/register.ts src/preload/index.ts src/renderer/api.d.ts tests/main/handlers.test.ts
git commit -m "feat(B2): extend createTunnel + add updateTunnel IPC (4-layer parity)"
```

---

### Task 3: Populate lastRun.stepCount at run completion

**Files:**
- Modify: `src/main/runner/playwrightRunner.ts` (pass `stepCount` into `updateLastRun`)
- Test: `tests/main/lastRunStepCount.test.ts` (new — round-trip through the scenario store)

**Interfaces:**
- Consumes: `LastRun.stepCount` (Task 1); `updateLastRun(projectId, tunnelId, id, lastRun)` from `scenarioStore` (signature unchanged — `stepCount` rides inside the `lastRun` object).
- Produces: after a run, the scenario's `lastRun.stepCount` equals the report's step count.

- [ ] **Step 1: Write the failing test**

Create `tests/main/lastRunStepCount.test.ts`. Mirror the workspace setup of `tests/main/tunnelStore.test.ts` (temp `OTL_WORKSPACE`, cleanup in `afterEach` via `Reflect.deleteProperty(process.env, "OTL_WORKSPACE")` + `rmSync`). The test saves a scenario (use the scenario store's create/save helper — check `src/main/stores/scenarioStore.ts` exports, e.g. `saveScenario`), calls `updateLastRun` with a `stepCount`, then reads it back via `getScenario`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let workspace: string;
beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "otl-lr-"));
	process.env.OTL_WORKSPACE = workspace;
});
afterEach(() => {
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	rmSync(workspace, { recursive: true, force: true });
});

it("updateLastRun persiste stepCount, relisible via getScenario", async () => {
	const { saveScenario, getScenario, updateLastRun } = await import(
		"../../src/main/stores/scenarioStore"
	);
	const scenario = {
		id: "s1",
		projectId: "p1",
		tunnelId: "t1",
		name: "S1",
		platform: "web" as const,
		browser: "chromium" as const,
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "s1.spec.ts",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastRun: { status: "never" as const },
	};
	saveScenario(scenario);
	updateLastRun("p1", "t1", "s1", {
		status: "passed",
		at: "2026-06-24T10:00:00.000Z",
		durationMs: 1234,
		stepCount: 11,
	});
	expect(getScenario("p1", "t1", "s1").lastRun.stepCount).toBe(11);
});
```

(If the scenario store's save function has a different name/shape, adapt to the real export — read `src/main/stores/scenarioStore.ts` first. The point of the test is the `stepCount` round-trip.)

- [ ] **Step 2: Run the test to verify it fails or passes structurally**

Run: `npx vitest run tests/main/lastRunStepCount.test.ts`
Expected: PASS already if `updateLastRun` writes the whole `lastRun` object (it does). This test LOCKS the behavior. If it fails, fix the store so the full `lastRun` (including `stepCount`) is persisted.

- [ ] **Step 3: Pass stepCount from the runner**

In `src/main/runner/playwrightRunner.ts`, the `updateLastRun` call (currently lines 185-189) becomes:
```ts
updateLastRun(scenario.projectId, scenario.tunnelId, scenario.id, {
	status: report.status === "passed" ? "passed" : "failed",
	at: startedAt,
	durationMs: report.durationMs,
	stepCount: report.steps.length,
});
```

- [ ] **Step 4: Run the full main suite to verify no regression**

Run: `npx vitest run tests/main`
Expected: PASS (includes the new test and the existing runner/integration tests).

- [ ] **Step 5: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/main/runner/playwrightRunner.ts tests/main/lastRunStepCount.test.ts
git commit -m "feat(B3): persist lastRun.stepCount from the run report"
```

---

### Task 4: Extract testable renderer time helpers + formatRelative

**Files:**
- Create: `src/renderer/lib/time.ts` (`formatRelative`, `formatDuration`, `formatAt`)
- Modify: `src/renderer/screens/HubLibrary.tsx` (import the helpers from lib; remove the local copies)
- Test: `tests/renderer/time.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `formatRelative(at?: string, now?: number): string`, `formatDuration(ms?: number): string`, `formatAt(at?: string): string` — all exported from `src/renderer/lib/time.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/time.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatRelative } from "../../src/renderer/lib/time";

const NOW = Date.parse("2026-06-24T12:00:00.000Z");

describe("formatRelative", () => {
	it("retourne — quand absent", () => {
		expect(formatRelative(undefined, NOW)).toBe("—");
	});
	it("à l'instant pour < 1 min", () => {
		expect(formatRelative("2026-06-24T11:59:30.000Z", NOW)).toBe("à l'instant");
	});
	it("minutes", () => {
		expect(formatRelative("2026-06-24T11:55:00.000Z", NOW)).toBe("il y a 5 min");
	});
	it("heures", () => {
		expect(formatRelative("2026-06-24T09:00:00.000Z", NOW)).toBe("il y a 3 h");
	});
	it("hier", () => {
		expect(formatRelative("2026-06-23T10:00:00.000Z", NOW)).toBe("hier");
	});
	it("jours", () => {
		expect(formatRelative("2026-06-21T12:00:00.000Z", NOW)).toBe("il y a 3 j");
	});
	it("au-delà de 7 jours bascule en date absolue", () => {
		const out = formatRelative("2026-06-10T12:00:00.000Z", NOW);
		expect(out).toMatch(/10\/06\/2026/);
	});
});

describe("formatDuration", () => {
	it("— quand absent", () => {
		expect(formatDuration(undefined)).toBe("—");
	});
	it("secondes", () => {
		expect(formatDuration(1234)).toBe("1.2s");
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/time.test.ts`
Expected: FAIL — module `src/renderer/lib/time.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/renderer/lib/time.ts`:
```ts
export function formatAt(at?: string): string {
	if (!at) return "—";
	return new Date(at).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatDuration(ms?: number): string {
	if (ms == null) return "—";
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateOnly(d: Date): string {
	return d.toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

// Relative time in French. `now` is an epoch-ms override for deterministic tests.
export function formatRelative(at?: string, now?: number): string {
	if (!at) return "—";
	const then = Date.parse(at);
	if (Number.isNaN(then)) return "—";
	const ref = now ?? Date.now();
	const diffMs = ref - then;
	const min = Math.floor(diffMs / 60_000);
	if (min < 1) return "à l'instant";
	if (min < 60) return `il y a ${min} min`;
	const hours = Math.floor(min / 60);
	if (hours < 24) return `il y a ${hours} h`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "hier";
	if (days <= 7) return `il y a ${days} j`;
	return formatDateOnly(new Date(then));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/time.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the lib from HubLibrary (no behavior change yet)**

In `src/renderer/screens/HubLibrary.tsx`: delete the local `formatAt` (lines 9-18) and `formatDuration` (lines 20-23), and add an import near the top:
```ts
import { formatAt, formatDuration } from "../lib/time";
```
(Leave all current usages — `formatAt(scenario.lastRun.at)`, `formatDuration(...)` — unchanged. `formatRelative` is added now but consumed in Task 5.)

- [ ] **Step 6: Run the renderer suite + build**

Run: `npx vitest run tests/renderer && npm run build`
Expected: PASS, build clean (Hub renders identically).

- [ ] **Step 7: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/lib/time.ts src/renderer/screens/HubLibrary.tsx tests/renderer/time.test.ts
git commit -m "feat(B4): extract renderer time helpers + add formatRelative"
```

---

### Task 5: Hub — group filter, colored group headers with status breakdown, richer scenario metas

**Files:**
- Create: `src/renderer/lib/groupStats.ts` (`formatGroupStats`)
- Modify: `src/renderer/screens/HubLibrary.tsx` (group filter tabs, group header color dot + stats + edit, row metas with browser·steps·relative)
- Modify: `src/renderer/theme.css` (group dot, group stats)
- Test: `tests/renderer/groupStats.test.ts` (new), `tests/renderer/hubLibrary.test.tsx` + `tests/renderer/filters.test.tsx` (platform filter → group filter)

**Interfaces:**
- Consumes: `Tunnel.color` (Task 1), `LastRun.stepCount` (Task 1), `formatRelative`/`formatDuration` (Task 4), `Scenario`.
- Produces: `formatGroupStats(items: Scenario[]): string` from `src/renderer/lib/groupStats.ts`. Hub filters by group (`"all" | tunnelId`), renders group headers with a color dot + breakdown, and scenario rows with `« <Plateforme> · <Navigateur> · N étapes »` + relative time.

- [ ] **Step 1: Write the failing group-stats tests**

Create `tests/renderer/groupStats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Scenario } from "../../src/shared/types";
import { formatGroupStats } from "../../src/renderer/lib/groupStats";

function sc(status: "passed" | "failed" | "never"): Scenario {
	return {
		id: `s-${Math.random()}`,
		projectId: "p1",
		tunnelId: "t1",
		name: "S",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "s.spec.ts",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastRun: { status },
	};
}

describe("formatGroupStats", () => {
	it("vide → chaîne vide", () => {
		expect(formatGroupStats([])).toBe("");
	});
	it("singulier/pluriel + segments non nuls", () => {
		expect(formatGroupStats([sc("passed"), sc("passed"), sc("passed"), sc("failed")])).toBe(
			"3 réussis · 1 échec",
		);
	});
	it("jamais exécutés", () => {
		expect(formatGroupStats([sc("never"), sc("never")])).toBe("2 jamais exécutés");
	});
	it("mixte complet", () => {
		expect(formatGroupStats([sc("passed"), sc("failed"), sc("never")])).toBe(
			"1 réussi · 1 échec · 1 jamais exécuté",
		);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/groupStats.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement formatGroupStats**

Create `src/renderer/lib/groupStats.ts`:
```ts
import type { Scenario } from "../../shared/types";

export function formatGroupStats(items: Scenario[]): string {
	let passed = 0;
	let failed = 0;
	let never = 0;
	for (const s of items) {
		if (s.lastRun.status === "passed") passed++;
		else if (s.lastRun.status === "failed") failed++;
		else never++;
	}
	const segs: string[] = [];
	if (passed > 0) segs.push(`${passed} ${passed > 1 ? "réussis" : "réussi"}`);
	if (failed > 0) segs.push(`${failed} ${failed > 1 ? "échecs" : "échec"}`);
	if (never > 0)
		segs.push(`${never} ${never > 1 ? "jamais exécutés" : "jamais exécuté"}`);
	return segs.join(" · ");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/renderer/groupStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the Hub filter + grouping + rows**

In `src/renderer/screens/HubLibrary.tsx`:

1. Add imports:
```ts
import { formatRelative } from "../lib/time";
import { formatGroupStats } from "../lib/groupStats";
```
(keep `formatAt`/`formatDuration` import from Task 4 — `formatDuration` still used; `formatAt` may be removed if no longer used after switching to relative time — remove it from the import if unused to keep lint clean.)

2. Replace the filter state. Change `type Filter = "all" | Platform;` and `const [filter, setFilter] = useState<Filter>("all");` to:
```ts
type GroupFilter = "all" | string; // "all" or a tunnelId
```
```ts
const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
```

3. Remove the inline-tunnel-creation feature: delete `creatingTunnel`/`tunnelName` state (lines 63-64), `handleCreateTunnel` (lines 94-101), the `+ Tunnel` button (lines 140-146), and the `creatingTunnel && (...)` block (lines 157-174).

4. Change `visible` (the search filter) to only apply the search query (group filtering happens at the section level):
```ts
const visible = useMemo(
	() =>
		scenarios.filter((s) => {
			if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
				return false;
			return true;
		}),
	[scenarios, query],
);
```

5. Change `groups` to respect the group filter:
```ts
const groups = useMemo(
	() =>
		tunnels
			.filter((t) => groupFilter === "all" || t.id === groupFilter)
			.map((t) => ({
				tunnel: t,
				items: visible.filter((s) => s.tunnelId === t.id),
			})),
	[tunnels, visible, groupFilter],
);
```

6. Replace the platform-tabs block (lines 185-197) with group tabs (« Tous · N », one per tunnel with a color dot, and a `+`). The total N counts all scenarios matching the search (= `visible.length`):
```tsx
<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
	<button
		type="button"
		className={groupFilter === "all" ? "otl-tab otl-tab--active" : "otl-tab"}
		onClick={() => setGroupFilter("all")}
	>
		Tous · {visible.length}
	</button>
	{tunnels.map((t) => (
		<button
			key={t.id}
			type="button"
			className={groupFilter === t.id ? "otl-tab otl-tab--active" : "otl-tab"}
			onClick={() => setGroupFilter(t.id)}
		>
			<span
				className="otl-group-dot"
				style={{ background: t.color }}
				aria-hidden="true"
			/>
			{t.name} · {visible.filter((s) => s.tunnelId === t.id).length}
		</button>
	))}
	<button
		type="button"
		className="otl-tab"
		aria-label="Nouveau groupe"
		onClick={() => navigate("/scenarios/groups/new")}
	>
		+
	</button>
</div>
```
(Keep `<EnvPicker value={envId} onChange={setEnvId} />` to the left as today.)

7. Enrich the group header (currently lines 219-224) with a color dot, the stats, and an edit button:
```tsx
<h2 className="otl-tunnel-group__title">
	<span
		className="otl-group-dot"
		style={{ background: g.tunnel.color }}
		aria-hidden="true"
	/>
	{g.tunnel.name}
	<span className="otl-tunnel-group__count">{g.items.length}</span>
	{formatGroupStats(g.items) && (
		<span className="otl-group-stats">{formatGroupStats(g.items)}</span>
	)}
	<button
		type="button"
		className="otl-tunnel-group__edit"
		onClick={() => navigate(`/scenarios/groups/${g.tunnel.id}/edit`)}
	>
		Éditer
	</button>
</h2>
```

8. Change the scenario row meta (currently lines 241-244) to include the browser nicely and the step count, and replace the absolute time with relative:
```tsx
<div className="otl-card__meta">
	{PLATFORM_LABELS[scenario.platform]} · {browserLabel(scenario.browser)}
	{scenario.lastRun.stepCount != null
		? ` · ${scenario.lastRun.stepCount} étapes`
		: ""}
</div>
```
And the time span (currently lines 248-250):
```tsx
<span className="otl-card__time">
	{formatRelative(scenario.lastRun.at)}
</span>
```
Add a `browserLabel` helper near `PLATFORM_LABELS`:
```ts
function browserLabel(b: Scenario["browser"]): string {
	if (b === "firefox") return "Firefox";
	if (b === "webkit") return "WebKit";
	return "Chromium";
}
```

- [ ] **Step 6: Update the Hub/filters tests (platform → group)**

`tests/renderer/filters.test.tsx`: the two platform-filter tests (« filtre par plateforme Web », « filtre par plateforme Responsive ») must become group-filter tests. Rewrite them to click a group tab (by group name, e.g. the "Réservation" tab the test fixtures create) and assert that scenarios from other groups disappear. Keep the search test and the env-at-launch test as-is. Example replacement for one:
```ts
it("filtre par groupe", async () => {
	renderHub(); // existing helper / setup in the file
	// wait for groups to load, then click the "Réservation" group tab
	const tab = await screen.findByRole("button", { name: /Réservation · \d/ });
	await userEvent.click(tab);
	// a scenario known to live in another group is now hidden
	expect(screen.queryByText("Scénario Général")).not.toBeInTheDocument();
});
```
(Adapt names to the actual fixtures in the file. Read the file's existing `renderHub`/mock setup and tunnel/scenario fixtures first; update the `window.api.listTunnels` mock so returned tunnels include `color`/`description`.)

`tests/renderer/hubLibrary.test.tsx`: the grouping test still asserts tunnel names + scenario names are visible — keep it, but update the `listTunnels` mock to return tunnels WITH `color`/`description`. Add one assertion that a group header shows its stats text (e.g. `expect(screen.getByText(/réussi|jamais exécuté/)).toBeInTheDocument()` if a fixture scenario has a known `lastRun.status`). Keep the two launch tests unchanged.

- [ ] **Step 7: Add CSS**

In `src/renderer/theme.css`, add near the `.otl-tunnel-group__*` rules:
```css
.otl-group-dot {
	display: inline-block;
	width: 9px;
	height: 9px;
	border-radius: 50%;
	margin-right: 6px;
	vertical-align: middle;
	flex: 0 0 auto;
}
.otl-group-stats {
	margin-left: 10px;
	font-size: 11px;
	font-weight: 500;
	color: var(--otl-text-2);
	text-transform: none;
	letter-spacing: 0;
}
.otl-tunnel-group__edit {
	margin-left: auto;
	background: none;
	border: none;
	color: var(--otl-text-2);
	font-size: 11px;
	cursor: pointer;
	padding: 2px 6px;
	border-radius: 6px;
}
.otl-tunnel-group__edit:hover {
	color: var(--otl-text-1);
	background: rgba(255, 255, 255, 0.06);
}
```
(Confirm `--otl-text-1`/`--otl-text-2` token names against the file; use the existing dim/strong text tokens.)

- [ ] **Step 8: Run renderer suite + build**

Run: `npx vitest run tests/renderer && npm run build`
Expected: PASS, build clean.

- [ ] **Step 9: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/lib/groupStats.ts src/renderer/screens/HubLibrary.tsx src/renderer/theme.css tests/renderer/groupStats.test.ts tests/renderer/hubLibrary.test.tsx tests/renderer/filters.test.tsx
git commit -m "feat(B5): Hub group filter, colored headers + status breakdown, richer metas"
```

---

### Task 6: NewGroupe screen (`/scenarios/groups/new`) + color palette component

**Files:**
- Create: `src/renderer/components/ColorPalette.tsx` (reused by Edit)
- Create: `src/renderer/screens/NewGroupe.tsx`
- Modify: `src/renderer/App.tsx` (route + import)
- Modify: `src/renderer/theme.css` (swatches, preview)
- Test: `tests/renderer/newGroupe.test.tsx`

**Interfaces:**
- Consumes: `GROUP_COLORS`/`DEFAULT_TUNNEL_COLOR` (`src/shared/groups.ts`), `window.api.createTunnel`, `window.api.listTunnels`, `useAppStore` (`activeProjectId`).
- Produces: route `/scenarios/groups/new` → `NewGroupe`. `ColorPalette` exported: `<ColorPalette value={string} onChange={(c: string) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/newGroupe.test.tsx`. Mirror the structure of `tests/renderer/newProject.test.tsx` (mock `window.api`, wrap in `MemoryRouter`, mock `useAppStore` `activeProjectId`). Assert:
```ts
// renders breadcrumb + title; "Créer le groupe" disabled until name typed;
// typing a name + clicking a swatch + create calls
// window.api.createTunnel with { projectId, name, color, description }.
```
Concretely:
```ts
it("désactive Créer tant que le nom est vide", () => {
	renderNewGroupe();
	expect(screen.getByRole("button", { name: /créer le groupe/i })).toBeDisabled();
});

it("crée un groupe avec couleur et description", async () => {
	const createTunnel = vi.fn().mockResolvedValue({ id: "t1" });
	// wire createTunnel into the window.api mock; listTunnels → []
	renderNewGroupe({ createTunnel });
	await userEvent.type(screen.getByPlaceholderText(/nom du groupe/i), "Réservation");
	await userEvent.type(screen.getByPlaceholderText(/description/i), "tunnel de vente");
	await userEvent.click(screen.getByRole("button", { name: /créer le groupe/i }));
	expect(createTunnel).toHaveBeenCalledWith(
		expect.objectContaining({
			projectId: expect.any(String),
			name: "Réservation",
			description: "tunnel de vente",
			color: expect.any(String),
		}),
	);
});
```
(Follow the exact mocking conventions of `newProject.test.tsx` — same way it stubs `window.api` and `useAppStore`/`useNavigate`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/newGroupe.test.tsx`
Expected: FAIL — screen/route do not exist.

- [ ] **Step 3: Implement ColorPalette**

Create `src/renderer/components/ColorPalette.tsx`:
```tsx
import { GROUP_COLORS } from "../../shared/groups";

export function ColorPalette({
	value,
	onChange,
}: {
	value: string;
	onChange: (c: string) => void;
}): JSX.Element {
	return (
		<div className="otl-swatches">
			{GROUP_COLORS.map((c) => (
				<button
					key={c}
					type="button"
					aria-label={`Couleur ${c}`}
					aria-pressed={value === c}
					className={
						value === c ? "otl-swatch otl-swatch--active" : "otl-swatch"
					}
					style={{ background: c }}
					onClick={() => onChange(c)}
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 4: Implement NewGroupe**

Create `src/renderer/screens/NewGroupe.tsx` following the `NewProject.tsx` pattern (breadcrumb `← Scénarios / Nouveau groupe`, `otl-screen` → `otl-hub-title` → `otl-create`):
```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Tunnel } from "../../shared/types";
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import { ColorPalette } from "../components/ColorPalette";
import { useAppStore } from "../store";

export default function NewGroupe(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [name, setName] = useState("");
	const [color, setColor] = useState(DEFAULT_TUNNEL_COLOR);
	const [description, setDescription] = useState("");
	const [existing, setExisting] = useState<Tunnel[]>([]);

	const load = useCallback(async () => {
		if (!activeProjectId) return;
		setExisting(await window.api.listTunnels(activeProjectId));
	}, [activeProjectId]);
	useEffect(() => {
		load();
	}, [load]);

	const canCreate = name.trim().length > 0 && !!activeProjectId;

	async function handleCreate(): Promise<void> {
		if (!canCreate || !activeProjectId) return;
		await window.api.createTunnel({
			projectId: activeProjectId,
			name: name.trim(),
			color,
			description: description.trim(),
		});
		navigate("/scenarios");
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/scenarios")}
				>
					← Scénarios
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Nouveau groupe</span>
			</nav>
			<h1 className="otl-hub-title">Nouveau groupe</h1>
			<p className="otl-hub-subtitle">
				Un groupe rassemble des scénarios d'un même parcours (ex. tunnel de
				vente).
			</p>
			<div className="otl-create">
				<div>
					<div className="otl-field-label">Nom du groupe</div>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du groupe"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Couleur</div>
					<ColorPalette value={color} onChange={setColor} />
				</div>
				<div>
					<div className="otl-field-label">Description — optionnel</div>
					<textarea
						className="otl-input otl-textarea"
						placeholder="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Aperçu dans le hub</div>
					<div className="otl-group-preview">
						<span
							className="otl-group-dot"
							style={{ background: color }}
							aria-hidden="true"
						/>
						{name.trim() || "Nouveau groupe"}
						<span className="otl-tunnel-group__count">0</span>
						<span className="otl-group-stats">vide pour l'instant</span>
					</div>
				</div>
				{existing.length > 0 && (
					<div>
						<div className="otl-field-label">Groupes existants</div>
						<div className="otl-group-existing">
							{existing.map((t) => (
								<div key={t.id} className="otl-group-existing__row">
									<span
										className="otl-group-dot"
										style={{ background: t.color }}
										aria-hidden="true"
									/>
									{t.name}
								</div>
							))}
						</div>
					</div>
				)}
				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canCreate}
						onClick={handleCreate}
					>
						Créer le groupe
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/scenarios")}
					>
						Annuler
					</button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 5: Register the route**

In `src/renderer/App.tsx`, add the import and route (after `/scenarios/new`):
```tsx
import NewGroupe from "./screens/NewGroupe";
```
```tsx
<Route path="/scenarios/groups/new" element={<NewGroupe />} />
```

- [ ] **Step 6: Add CSS**

In `src/renderer/theme.css`, add:
```css
.otl-swatches {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.otl-swatch {
	width: 26px;
	height: 26px;
	border-radius: 50%;
	border: 2px solid transparent;
	cursor: pointer;
	padding: 0;
}
.otl-swatch--active {
	border-color: var(--otl-text-1);
	box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}
.otl-group-preview,
.otl-group-existing__row {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 10px;
	background: rgba(255, 255, 255, 0.04);
	font-size: 14px;
}
.otl-group-existing {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.otl-textarea {
	min-height: 64px;
	resize: vertical;
	padding-top: 8px;
}
```

- [ ] **Step 7: Run test + build**

Run: `npx vitest run tests/renderer/newGroupe.test.tsx && npm run build`
Expected: PASS, build clean.

- [ ] **Step 8: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/components/ColorPalette.tsx src/renderer/screens/NewGroupe.tsx src/renderer/App.tsx src/renderer/theme.css tests/renderer/newGroupe.test.tsx
git commit -m "feat(B6): NewGroupe screen + color palette"
```

---

### Task 7: EditGroupe screen (`/scenarios/groups/:tunnelId/edit`) with delete guard

**Files:**
- Create: `src/renderer/screens/EditGroupe.tsx`
- Modify: `src/renderer/App.tsx` (route + import)
- Test: `tests/renderer/editGroupe.test.tsx`

**Interfaces:**
- Consumes: `window.api.listTunnels`, `window.api.updateTunnel`, `window.api.deleteTunnel`, `window.api.listScenariosByProject`, `ColorPalette`, `useAppStore` (`activeProjectId`), `useParams` (`tunnelId`).
- Produces: route `/scenarios/groups/:tunnelId/edit` → `EditGroupe`.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/editGroupe.test.tsx` (mirror `projectEnvironments.test.tsx` for the `useParams`/load pattern). Assert:
```ts
// loads the tunnel and prefills name/description;
// "Enregistrer les modifications" calls window.api.updateTunnel with the edited fields;
// the delete button is DISABLED when the group still has scenarios;
// the delete button is ENABLED (and calls deleteTunnel) when the group is empty and not the last.
```
Set up the `window.api` mock so `listTunnels` returns two tunnels (so it's not the last) one of which is the `:tunnelId`, and `listScenariosByProject` returns a scenario in that tunnel for the disabled case (and `[]` for the enabled case in a second test).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/editGroupe.test.tsx`
Expected: FAIL — screen/route do not exist.

- [ ] **Step 3: Implement EditGroupe**

Create `src/renderer/screens/EditGroupe.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Scenario, Tunnel } from "../../shared/types";
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import { ColorPalette } from "../components/ColorPalette";
import { useAppStore } from "../store";

export default function EditGroupe(): JSX.Element {
	const navigate = useNavigate();
	const { tunnelId = "" } = useParams();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [tunnel, setTunnel] = useState<Tunnel | null>(null);
	const [name, setName] = useState("");
	const [color, setColor] = useState(DEFAULT_TUNNEL_COLOR);
	const [description, setDescription] = useState("");
	const [tunnelCount, setTunnelCount] = useState(0);
	const [scenariosInGroup, setScenariosInGroup] = useState(0);

	const load = useCallback(async () => {
		if (!activeProjectId) return;
		const tunnels = await window.api.listTunnels(activeProjectId);
		setTunnelCount(tunnels.length);
		const t = tunnels.find((x) => x.id === tunnelId) ?? null;
		setTunnel(t);
		if (t) {
			setName(t.name);
			setColor(t.color);
			setDescription(t.description);
		}
		const scs: Scenario[] =
			await window.api.listScenariosByProject(activeProjectId);
		setScenariosInGroup(scs.filter((s) => s.tunnelId === tunnelId).length);
	}, [activeProjectId, tunnelId]);
	useEffect(() => {
		load();
	}, [load]);

	const canSave = name.trim().length > 0 && !!tunnel;
	const canDelete = !!tunnel && tunnelCount > 1 && scenariosInGroup === 0;

	async function handleSave(): Promise<void> {
		if (!canSave || !tunnel) return;
		await window.api.updateTunnel({
			...tunnel,
			name: name.trim(),
			color,
			description: description.trim(),
		});
		navigate("/scenarios");
	}

	async function handleDelete(): Promise<void> {
		if (!canDelete || !tunnel) return;
		await window.api.deleteTunnel(tunnel.projectId, tunnel.id);
		navigate("/scenarios");
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/scenarios")}
				>
					← Scénarios
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>{tunnel?.name ?? "Groupe"}</span>
			</nav>
			<h1 className="otl-hub-title">Modifier le groupe</h1>
			<div className="otl-create">
				<div>
					<div className="otl-field-label">Nom du groupe</div>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du groupe"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Couleur</div>
					<ColorPalette value={color} onChange={setColor} />
				</div>
				<div>
					<div className="otl-field-label">Description — optionnel</div>
					<textarea
						className="otl-input otl-textarea"
						placeholder="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canSave}
						onClick={handleSave}
					>
						Enregistrer les modifications
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/scenarios")}
					>
						Annuler
					</button>
					<button
						type="button"
						className="otl-btn-stop"
						disabled={!canDelete}
						title={
							canDelete
								? "Supprimer ce groupe"
								: "Déplacez ou supprimez d'abord ses scénarios"
						}
						onClick={handleDelete}
					>
						Supprimer
					</button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Register the route**

In `src/renderer/App.tsx`:
```tsx
import EditGroupe from "./screens/EditGroupe";
```
```tsx
<Route path="/scenarios/groups/:tunnelId/edit" element={<EditGroupe />} />
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run tests/renderer/editGroupe.test.tsx && npm run build`
Expected: PASS, build clean.

- [ ] **Step 6: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/screens/EditGroupe.tsx src/renderer/App.tsx tests/renderer/editGroupe.test.tsx
git commit -m "feat(B7): EditGroupe screen with delete guard"
```

---

### Task 8: E2E flow + full-suite green + cleanup verification

**Files:**
- Create: `tests/e2e/groups.spec.ts`
- Modify (only if needed): existing e2e specs if the Hub changes broke a selector
- Test: the whole suite + build + lint

**Interfaces:**
- Consumes: everything from B1-B7.
- Produces: an E2E proving create-group → tabs/section with color → filter → edit → delete-guard.

- [ ] **Step 1: Write the E2E**

Create `tests/e2e/groups.spec.ts`, mirroring `tests/e2e/projects.spec.ts` (same `_electron` launch, `OTL_WORKSPACE`/`OTL_FIXTURES`/`OTL_RUNNER_CONFIG`, `try/finally`). Flow:
```ts
// 1. launch; app opens on /projects (seed has "Projet par défaut")
// 2. click sidebar "Scénarios" to reach the Hub
// 3. click the "+" tab (aria-label "Nouveau groupe") → /scenarios/groups/new
// 4. type a group name "Réservation", click a color swatch, click "Créer le groupe"
// 5. back on the Hub: assert a tab "Réservation · 0" is visible (group tab created)
// 6. click the "Réservation" group tab → assert it filters (its empty section / header visible)
// 7. open its edit screen via the header "Éditer" (or navigate) → change description → save
// 8. (guard) re-open edit and assert the "Supprimer" button is enabled (empty group, not last)
//    then click it and assert the group tab disappears from the Hub
```
Gate every step on `toBeVisible({ timeout: 15000 })`; scope ambiguous buttons with a container locator as in `projects.spec.ts`. Use `getByRole("button", { name: "Nouveau groupe" })` for the `+` tab.

- [ ] **Step 2: Build, then run E2E**

Run: `npm run build && npx playwright test --config playwright.e2e.config.ts tests/e2e/groups.spec.ts`
Expected: PASS. If a selector is ambiguous, scope it; do not add `waitForTimeout`.

- [ ] **Step 3: Run the WHOLE suite + build + lint**

Run:
```bash
npm test
npm run build
npx @biomejs/biome check .
npx playwright test --config playwright.e2e.config.ts
```
Expected: all unit tests pass, build clean, lint clean (whole tree), all e2e pass (the existing happy-path/failure-path/recording/projects specs must still pass — the Hub still groups by tunnel and the launch path is unchanged).

- [ ] **Step 4: Cleanup verification**

Confirm no dead code remains from the old platform filter / inline tunnel creation:
```bash
grep -rn "creatingTunnel\|handleCreateTunnel\|+ Tunnel\|Nom du tunnel" src/renderer || echo "clean"
```
Expected: `clean` (the renderer no longer references the removed inline-tunnel feature). `handleCreateTunnel` should appear only in the main handler/tests, not the renderer.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/groups.spec.ts
git commit -m "test(B8): e2e group create/filter/edit/delete + full-suite green"
```

---

## Notes for the executor

- Each task is **additive and leaves the repo green** (unit + build). Stack all 8 on `feat/phaseB-hub-groupes`, then one PR → `main`, watch CI to green per-job, merge `--squash --delete-branch` (NO `--auto`; gate côté loop, see the `ci-merge-gate` memory).
- After the 8 tasks: whole-branch review (opus, `MERGE_BASE..HEAD`), consolidated fix wave for any FIX-BEFORE-MERGE items, then PR + CI watch + merge, then a real-app demo with screenshots (create colored group → metas → edit/delete) shared with the user.
- The merge-base for this branch is the current `main` HEAD (Phase A merged): record it before Task 1.
