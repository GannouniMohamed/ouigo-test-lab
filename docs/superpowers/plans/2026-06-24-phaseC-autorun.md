# Phase C — Auto-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user finishes recording a new scenario, automatically launch one validation run, show the Live Run screen in an "AUTO" mode (badge + banner), surface a "1ʳᵉ exécution…" state in the Hub while that first run is in progress, relabel "Tunnel"→"Groupe", and wire the (currently cosmetic) platform selection through to the persisted scenario.

**Architecture:** Electron-vite 3-layer (main/preload/renderer). Renderer-only auto-run trigger in `NewScenario.handleStop` (reuses existing `runScenario`/`onRunEvent` IPC). A non-persisted Zustand field `firstRunScenarioId` tracks the in-progress first run for the Hub. Platform is threaded through the existing `recording:start` payload (optional field, default `"web"`).

**Tech Stack:** TypeScript, React + React Router (HashRouter), Zustand, Vitest + @testing-library/react, Playwright `_electron` for E2E, Biome.

## Global Constraints

- **IPC parity** across `preload`/`register`/`api.d.ts`/`handler` for any changed channel. Here only `recording:start` gains an OPTIONAL `platform?: Platform` field — keep the four layers identical. `runScenario`/`scenario:run` and `onRunEvent` are UNCHANGED.
- **Entity name stays `tunnel`** in code/IPC; UI label becomes "Groupe".
- **`firstRunScenarioId` is NOT persisted** (no localStorage) — it resets on app restart.
- **Auto-run env precedence** = `activeEnvByProject[projectId] || envId || scenario.defaultEnvironmentId || "local"` (same as the Hub launch).
- **Auto-run error fallback**: if `stopRecording`/`runScenario` throws, reset `firstRunScenarioId` to null and `navigate("/scenarios")` — the recording is already saved.
- **Biome**: tabs/LF. Run `npx @biomejs/biome check .` (whole tree) before every commit.
- **E2E `*.spec.ts`** under `tests/e2e/`, launched via Playwright `_electron`, gated on `toBeVisible`, never `waitForTimeout`. The recording e2e stubs codegen via `OTL_CODEGEN`/`OTL_CODEGEN_ARGS` and the runner via `OTL_RUNNER_CONFIG`.
- CI = `npm run lint`, `npm test`, `npm run build` (3 OS) + `npm run test:e2e`. No `tsc --noEmit` gate, but keep types honest (`npx tsc --noEmit` should introduce no NEW errors; pre-existing errors in `LiveRun.tsx:152`/`appGate.test.tsx` predate this work — confirm via git, don't "fix" them here unless trivially in your file).
- **Critical cross-task note:** introducing auto-run CHANGES the post-recording flow. The existing `tests/e2e/recording.spec.ts` (which expects a return to the Hub + a manual "Lancer" click after stopping) WILL break. The task that adds auto-run (Task 4) MUST update that e2e to the new flow (stop → auto Live Run with AUTO badge → Report "Réussi").

---

### Task 1: Store — `firstRunScenarioId` (non-persisted)

**Files:**
- Modify: `src/renderer/store.ts` (add field + setter)
- Test: `tests/renderer/store.test.ts` (add cases; the file already exists)

**Interfaces:**
- Consumes: nothing.
- Produces: `useAppStore` gains `firstRunScenarioId: string | null` (initial `null`) and `setFirstRunScenarioId: (id: string | null) => void`.

- [ ] **Step 1: Write the failing test**

In `tests/renderer/store.test.ts` (reuse its existing setup/imports), add:
```ts
it("setFirstRunScenarioId pose puis efface le flag", () => {
	expect(useAppStore.getState().firstRunScenarioId).toBeNull();
	useAppStore.getState().setFirstRunScenarioId("scn-1");
	expect(useAppStore.getState().firstRunScenarioId).toBe("scn-1");
	useAppStore.getState().setFirstRunScenarioId(null);
	expect(useAppStore.getState().firstRunScenarioId).toBeNull();
});
```
(If the file resets store state in `beforeEach`/`afterEach`, ensure this test leaves `firstRunScenarioId` null at the end — it does.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/store.test.ts`
Expected: FAIL — `firstRunScenarioId`/`setFirstRunScenarioId` undefined.

- [ ] **Step 3: Implement**

In `src/renderer/store.ts`, add to the `AppState` interface (after `setActiveEnv`):
```ts
	firstRunScenarioId: string | null;
	setFirstRunScenarioId: (id: string | null) => void;
```
And to the store body (after the `setActiveEnv` implementation):
```ts
	firstRunScenarioId: null,
	setFirstRunScenarioId: (id) => set({ firstRunScenarioId: id }),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/renderer/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/store.ts tests/renderer/store.test.ts
git commit -m "feat(C1): store firstRunScenarioId for auto-run tracking"
```

---

### Task 2: Wire platform through the recorder (main + 4-layer IPC)

**Files:**
- Modify: `src/main/ipc/recordingHandlers.ts` (`StartRecordingOpts.platform?`)
- Modify: `src/main/recorder/playwrightRecorder.ts` (store platform in session; use it at stop)
- Modify: `src/preload/index.ts` (`startRecording` payload `+ platform?`)
- Modify: `src/renderer/api.d.ts` (`startRecording` payload `+ platform?`)
- Test: `tests/main/recordingPlatform.test.ts` (new) OR extend an existing recorder test

**Interfaces:**
- Consumes: `Platform` from `src/shared/types`.
- Produces: `startRecording` accepts optional `platform?: Platform`; the persisted `Scenario.platform` equals the provided platform (default `"web"`).

- [ ] **Step 1: Add `platform?` to `StartRecordingOpts`**

In `src/main/ipc/recordingHandlers.ts`, import `Platform` and add the field:
```ts
import type { Platform, Scenario } from "../../shared/types";
```
```ts
export interface StartRecordingOpts {
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
	platform?: Platform;
}
```

- [ ] **Step 2: Thread platform through the recorder**

In `src/main/recorder/playwrightRecorder.ts`:
1. Import `Platform`:
```ts
import type { Platform, Scenario } from "../../shared/types";
```
2. Add `platform: Platform` to the `RecordingSession` interface (after `tunnelId`).
3. Widen the `startRecording` opts param type to include `platform?: Platform` (mirror `StartRecordingOpts`).
4. Where the `RecordingSession` is created and stored in `activeRecordings` (in `startRecording`, after computing args), include `platform: opts.platform ?? "web"`. (Read the session-construction block — it sets `name`/`browser`/`environmentId`/`projectId`/`tunnelId`; add `platform` alongside.)
5. In `stopRecording`, change the hardcoded `platform: "web"` (currently line ~158) to `platform: session.platform`.

- [ ] **Step 3: 4-layer parity — preload + api.d.ts**

In `src/preload/index.ts`, add `platform?: Platform` to the `startRecording` opts type (and import `Platform` if needed). In `src/renderer/api.d.ts`, add `platform?: Platform` to the `startRecording` opts type. (Channel `recording:start` is unchanged; only the payload gains an optional field.)

- [ ] **Step 4: Write the test**

Create `tests/main/recordingPlatform.test.ts` mirroring the workspace setup of `tests/main/tunnelStore.test.ts` (temp `OTL_WORKSPACE`, `OTL_CODEGEN`/`OTL_CODEGEN_ARGS` pointing at the fake codegen fixture used by the e2e — `tests/fixtures/fake-codegen.mjs`, and `OTL_FIXTURES` if the recorder needs an env baseURL). The test should: seed a project + environment + tunnel (use the stores/seed helpers, or set up the minimal workspace the recorder needs — read how `tests/main` recorder tests bootstrap state first, e.g. `tests/main/playwrightRecorder.test.ts`), call `playwrightRecorder.startRecording({ ..., platform: "responsive" })`, then `stopRecording(recordingId)`, and assert the returned `Scenario.platform === "responsive"`. If bootstrapping a full recording in a unit test is impractical, instead assert at the handler boundary by reading `tests/main/playwrightRecorder.test.ts` and following its exact harness.

Run: `npx vitest run tests/main/recordingPlatform.test.ts` → must PASS (platform round-trips).

- [ ] **Step 5: Verify no regression + parity**

Run: `npx vitest run tests/main && npm run build`
Expected: PASS, build clean. Confirm `npx tsc --noEmit 2>&1 | grep -iE "platform|startRecording"` shows no new errors.

- [ ] **Step 6: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/main/ipc/recordingHandlers.ts src/main/recorder/playwrightRecorder.ts src/preload/index.ts src/renderer/api.d.ts tests/main/recordingPlatform.test.ts
git commit -m "feat(C2): thread platform through recorder (persist scenario.platform)"
```

---

### Task 3: Live Run AUTO mode (badge + banner)

**Files:**
- Modify: `src/renderer/screens/LiveRun.tsx` (read `useLocation().state.auto`, render badge + banner)
- Modify: `src/renderer/theme.css` (`.live-run__auto-badge`, `.live-run__auto-banner`)
- Test: `tests/renderer/liveRun.test.tsx` (new, or extend if one exists)

**Interfaces:**
- Consumes: route state `{ auto?: boolean }` passed by `navigate(...)` (set in Task 4).
- Produces: when `state.auto` is true, LiveRun shows an "AUTO" badge and a "Première exécution — validation automatique" banner.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/liveRun.test.tsx`. Render `LiveRun` inside a `MemoryRouter` whose entry carries `state: { auto: true }`, mock `window.api.onRunEvent` to a no-op returning an unsub function, and assert the AUTO badge + banner text appear. Also render WITHOUT auto state and assert they do NOT appear. Example:
```tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import LiveRun from "../../src/renderer/screens/LiveRun";

function renderAt(state: unknown) {
	// @ts-expect-error test shim
	window.api = {
		onRunEvent: () => () => {},
		cancelRun: vi.fn(),
	};
	return render(
		<MemoryRouter initialEntries={[{ pathname: "/run/r1", state }]}>
			<Routes>
				<Route path="/run/:runId" element={<LiveRun />} />
			</Routes>
		</MemoryRouter>,
	);
}

it("affiche le badge AUTO et le bandeau en mode auto", () => {
	renderAt({ auto: true });
	expect(screen.getByText("AUTO")).toBeInTheDocument();
	expect(
		screen.getByText(/Première exécution — validation automatique/i),
	).toBeInTheDocument();
});

it("n'affiche pas le mode AUTO sans state.auto", () => {
	renderAt(undefined);
	expect(screen.queryByText("AUTO")).not.toBeInTheDocument();
});
```
(Match the existing renderer-test conventions for stubbing `window.api` — check another renderer test if this shim shape differs.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/liveRun.test.tsx`
Expected: FAIL — no AUTO badge/banner yet.

- [ ] **Step 3: Implement**

In `src/renderer/screens/LiveRun.tsx`:
1. Add `useLocation` to the react-router-dom import:
```ts
import { useLocation, useNavigate, useParams } from "react-router-dom";
```
2. Inside the component, after `const navigate = useNavigate();`:
```ts
const auto = (useLocation().state as { auto?: boolean } | null)?.auto ?? false;
```
3. In the header-left block (currently the status pill + `<h1>`), add the badge when `auto`:
```tsx
<div className="live-run__header-left">
	<span className="otl-run-status">
		<span className="otl-run-status__dot" />
		En cours
	</span>
	{auto && <span className="live-run__auto-badge">AUTO</span>}
	<h1 className="live-run__title">Exécution en cours</h1>
</div>
```
4. Between the `live-run__header` div (closes at the current line ~242) and the progress bar (`<div className="otl-progress">`), insert the banner:
```tsx
{auto && (
	<div className="live-run__auto-banner">
		<div className="live-run__auto-banner-title">
			Première exécution — validation automatique
		</div>
		<div className="live-run__auto-banner-text">
			Le scénario que vous venez d'enregistrer est lancé une fois pour
			vérifier qu'il fonctionne. Aucune action requise.
		</div>
	</div>
)}
```

- [ ] **Step 4: Add CSS**

In `src/renderer/theme.css`, add:
```css
.live-run__auto-badge {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: #04121a;
	background: linear-gradient(90deg, var(--otl-cyan), var(--otl-blue));
}
.live-run__auto-banner {
	margin: 0 0 1rem;
	padding: 12px 14px;
	border-radius: 10px;
	background: rgba(0, 201, 177, 0.08);
	border: 1px solid rgba(0, 201, 177, 0.25);
}
.live-run__auto-banner-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--otl-text);
}
.live-run__auto-banner-text {
	margin-top: 4px;
	font-size: 12.5px;
	color: var(--otl-text-2);
}
```
(Verify `--otl-cyan`/`--otl-blue`/`--otl-text`/`--otl-text-2` exist in theme.css — they do; there is NO `--otl-text-1`.)

- [ ] **Step 5: Run test + build**

Run: `npx vitest run tests/renderer/liveRun.test.tsx && npm run build`
Expected: PASS, build clean.

- [ ] **Step 6: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/screens/LiveRun.tsx src/renderer/theme.css tests/renderer/liveRun.test.tsx
git commit -m "feat(C3): Live Run AUTO mode (badge + banner)"
```

---

### Task 4: Auto-run trigger in NewScenario + "Groupe" relabel + platform pass + e2e update

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx` (auto-run in `handleStop`; relabel; "Web Desktop"; pass `platform`)
- Modify: `tests/e2e/recording.spec.ts` (update to the auto-run flow — REQUIRED, the old flow breaks)
- Test: `tests/renderer/newScenario.test.tsx` (extend/add: `handleStop` triggers auto-run)

**Interfaces:**
- Consumes: `firstRunScenarioId` setter (Task 1), `runScenario` (existing), `activeEnvByProject` (store), platform plumbing (Task 2).
- Produces: stopping a recording auto-runs the scenario and navigates to `/run/:runId` with `state.auto = true`.

- [ ] **Step 1: Write the failing renderer test**

In `tests/renderer/newScenario.test.tsx` (read its existing mocking conventions first — how it stubs `window.api`, `useAppStore`, `useNavigate`), add a test that after recording stops, the component calls `runScenario` and navigates to `/run/<id>` with `{ state: { auto: true } }`, and sets `firstRunScenarioId`. Mock `stopRecording` to resolve a scenario `{ id: "scn-1", projectId: "p1", tunnelId: "t1", defaultEnvironmentId: "preprod", ... }` and `runScenario` to resolve `{ runId: "run-9" }`. Assert:
```ts
expect(runScenario).toHaveBeenCalledWith("p1", "t1", "scn-1", expect.any(String));
expect(navigateMock).toHaveBeenCalledWith("/run/run-9", { state: { auto: true } });
```
(Construct a full `Scenario` object in the mock so types are satisfied. Drive the UI: fill name, click "Démarrer l'enregistrement", then click "Arrêter l'enregistrement".)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/newScenario.test.tsx`
Expected: FAIL — `handleStop` still does `navigate("/scenarios")`.

- [ ] **Step 3: Implement the auto-run + relabel + platform pass**

In `src/renderer/screens/NewScenario.tsx`:
1. Read the needed store fields at the top of the component:
```ts
const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
const setFirstRunScenarioId = useAppStore((s) => s.setFirstRunScenarioId);
```
2. Pass `platform` in `handleStart`:
```ts
const { recordingId: id } = await window.api.startRecording({
	name,
	browser: "chromium",
	environmentId: envId || "local",
	projectId: activeProjectId,
	tunnelId: tunnelId || "general",
	platform,
});
```
3. Replace `handleStop` with the auto-run flow:
```ts
async function handleStop() {
	if (!recordingId) return;
	try {
		const scenario = await window.api.stopRecording(recordingId);
		const env =
			activeEnvByProject[scenario.projectId] ||
			envId ||
			scenario.defaultEnvironmentId ||
			"local";
		setFirstRunScenarioId(scenario.id);
		const { runId } = await window.api.runScenario(
			scenario.projectId,
			scenario.tunnelId,
			scenario.id,
			env,
		);
		navigate(`/run/${runId}`, { state: { auto: true } });
	} catch {
		setFirstRunScenarioId(null);
		navigate("/scenarios");
	}
}
```
4. Relabel the group field: change `<div className="otl-field-label">Tunnel</div>` to `Groupe`, and the `<select aria-label="Tunnel">` to `aria-label="Groupe"`.
5. Rename the Web card label: change `<span className="otl-platform__name">Web</span>` to `Web Desktop` (keep `setPlatform("web")` and the `platform === "web"` checks unchanged — only the visible text changes).

- [ ] **Step 4: Run the renderer test to verify pass**

Run: `npx vitest run tests/renderer/newScenario.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the recording e2e to the auto-run flow**

The old `tests/e2e/recording.spec.ts` expected a return to the Hub + a manual "Lancer" click. Auto-run changes this. Rewrite the body after the stop click so the flow is: record → stop → AUTO Live Run → Report "Réussi". Replace lines 31-39 (the stop click + Hub assertions + Lancer) with:
```ts
await win.getByRole("button", { name: /arrêter/i }).click();
// Auto-run kicks in: Live Run opens in AUTO mode
await expect(win.getByText("AUTO")).toBeVisible({ timeout: 15000 });
await expect(
	win.getByText(/Première exécution — validation automatique/i),
).toBeVisible({ timeout: 15000 });
// The auto run completes and lands on the Report
await expect(win.getByText("Réussi", { exact: true })).toBeVisible({
	timeout: 120000,
});
```
(Keep the launch/setup identical, including the `OTL_CODEGEN`/`OTL_CODEGEN_ARGS`/`OTL_RUNNER_CONFIG` env. Rename the test title to reflect auto-run, e.g. `"enregistrement → auto-run → Rapport Réussi"`.)

- [ ] **Step 6: Build + run the updated e2e**

Run: `npm run build && npx playwright test --config playwright.e2e.config.ts tests/e2e/recording.spec.ts`
Expected: PASS via the auto-run path (no manual Lancer).

- [ ] **Step 7: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/screens/NewScenario.tsx tests/renderer/newScenario.test.tsx tests/e2e/recording.spec.ts
git commit -m "feat(C4): auto-run after recording + Groupe relabel + platform pass; update recording e2e"
```

---

### Task 5: Hub "1ʳᵉ exécution…" state + flag cleanup

**Files:**
- Modify: `src/renderer/screens/HubLibrary.tsx` (render in-progress state; clear flag on reload)
- Modify: `src/renderer/theme.css` (`.otl-card__firstrun` if needed)
- Test: `tests/renderer/hubLibrary.test.tsx` (add a case)

**Interfaces:**
- Consumes: `firstRunScenarioId` (store), `setFirstRunScenarioId` (store).
- Produces: while `firstRunScenarioId === scenario.id`, the Hub row shows a "Nouveau" badge + "1ʳᵉ exécution…" and hides the "Lancer" button; the flag is cleared on reload once that scenario's `lastRun.status !== "never"`.

- [ ] **Step 1: Write the failing test**

In `tests/renderer/hubLibrary.test.tsx` (read its existing setup/fixtures first), add a test that seeds the store with `firstRunScenarioId` equal to one fixture scenario's id (use `useAppStore.setState({ firstRunScenarioId: "<id>" })` or the setter), renders the Hub, and asserts that scenario's row shows "1ʳᵉ exécution…" and does NOT show a "Lancer" button, while another scenario still shows "Lancer". Example shape:
```ts
useAppStore.setState({ firstRunScenarioId: "scn-running" });
renderHub(); // existing helper
expect(screen.getByText(/1ʳᵉ exécution…/)).toBeInTheDocument();
// the running scenario's row has no Lancer button
```
(Adapt to the real fixtures/helper names. Ensure the fixture for the "running" scenario has `lastRun.status: "never"`. Reset `firstRunScenarioId` to null in cleanup.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/hubLibrary.test.tsx`
Expected: FAIL — no "1ʳᵉ exécution…" rendering.

- [ ] **Step 3: Implement the Hub row state**

In `src/renderer/screens/HubLibrary.tsx`:
1. Read the store field + setter:
```ts
const firstRunScenarioId = useAppStore((s) => s.firstRunScenarioId);
const setFirstRunScenarioId = useAppStore((s) => s.setFirstRunScenarioId);
```
2. In `reload()`, after `setScenarios(s)`, clear a stale flag:
```ts
if (firstRunScenarioId) {
	const sc = s.find((x) => x.id === firstRunScenarioId);
	if (!sc || sc.lastRun.status !== "never") {
		setFirstRunScenarioId(null);
	}
}
```
(Add `firstRunScenarioId`/`setFirstRunScenarioId` to the `reload` `useCallback` dependency array.)
3. In the scenario-row render, branch on the in-progress flag. Replace the right-side cluster (`StatusBadge` + time + duration + Lancer) with:
```tsx
<div className="otl-card__right">
	{firstRunScenarioId === scenario.id ? (
		<>
			<span className="otl-badge otl-badge--new">
				<span className="otl-badge__dot" />
				<span className="otl-badge__label">Nouveau</span>
			</span>
			<span className="otl-card__firstrun">1ʳᵉ exécution…</span>
		</>
	) : (
		<>
			<StatusBadge status={scenario.lastRun.status} />
			<span className="otl-card__time">
				{formatRelative(scenario.lastRun.at)}
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
		</>
	)}
</div>
```
(Keep the existing meta line and card-failed class logic unchanged.)

- [ ] **Step 4: Add CSS**

In `src/renderer/theme.css`, add a "new" badge variant + the firstrun text (reuse `.otl-badge` base):
```css
.otl-badge--new .otl-badge__dot {
	background: var(--otl-blue);
}
.otl-badge--new .otl-badge__label {
	color: var(--otl-blue);
}
.otl-card__firstrun {
	font-size: 12px;
	color: var(--otl-text-2);
	font-style: italic;
}
```
(Confirm `.otl-badge`, `.otl-badge__dot`, `.otl-badge__label` exist — they do from Phase B; `--otl-blue` exists.)

- [ ] **Step 5: Run renderer suite + build**

Run: `npx vitest run tests/renderer && npm run build`
Expected: PASS, build clean.

- [ ] **Step 6: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/renderer/screens/HubLibrary.tsx src/renderer/theme.css tests/renderer/hubLibrary.test.tsx
git commit -m "feat(C5): Hub 1ère exécution state + first-run flag cleanup"
```

---

### Task 6: Full-suite green + e2e verification + cleanup

**Files:**
- Modify (only if needed): selectors/fixtures broken by the changes
- Test: the whole unit suite + build + lint + all e2e

**Interfaces:**
- Consumes: everything from C1-C5.

- [ ] **Step 1: Run the WHOLE suite**

Run:
```bash
npm test
npm run build
npx @biomejs/biome check .
npm run build && npx playwright test --config playwright.e2e.config.ts
```
Expected: all unit tests pass, build clean, lint clean (whole tree), ALL e2e pass — including the updated `recording.spec.ts` (auto-run flow) and the existing `happy-path`/`failure-path`/`projects`/`groups` specs. The `happy-path`/`failure-path` specs launch a run from the Hub (manual, no auto state) — confirm they still pass (no AUTO badge on manual launch).

- [ ] **Step 2: Confirm the AUTO-badge assertion is exercised**

Verify `tests/e2e/recording.spec.ts` asserts both the "AUTO" badge and the banner after stopping, and lands on "Réussi". If any earlier task left it incomplete, finish it here.

- [ ] **Step 3: tsc honesty check**

Run: `npx tsc --noEmit 2>&1 | grep -vE "LiveRun.tsx\(152|appGate.test|filters.test" | grep "error TS" || echo "no new errors"`
Expected: `no new errors` (only the pre-existing unrelated ones remain).

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
npx @biomejs/biome check .
git add -A
git commit -m "test(C6): full-suite + e2e green for auto-run"
```
(If steps 1-3 required no changes, skip the commit and note the suite is already green from prior tasks.)

---

## Notes for the executor

- Each task is **additive and leaves the repo green** (unit + build). The one exception is the e2e behavior change, which Task 4 handles by updating `recording.spec.ts` in the same task that introduces auto-run.
- Stack all tasks on `feat/phaseC-autorun`, then one PR → `main`, watch CI per-job, merge `--squash --delete-branch` (NO `--auto`; gate côté loop, per the `ci-merge-gate` memory).
- After the tasks: whole-branch review (opus, `MERGE_BASE..HEAD`), consolidated fix wave for any FIX-BEFORE-MERGE items, then PR + CI watch + merge, then a real-app demo (record a fake scenario → auto Live Run AUTO → Report) with screenshots shared with the user.
- MERGE_BASE for this branch = current `main` HEAD (Phase B merged) — record it before Task 1.
