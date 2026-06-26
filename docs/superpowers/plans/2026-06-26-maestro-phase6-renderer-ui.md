# Maestro Phase 6 — Renderer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the merged Maestro mobile backend (Phases 1–5) into the renderer so a non-technical tester can configure a mobile app on an environment, diagnose prerequisites, pick a device, record a mobile parcours, and have it auto-run — all from the UI.

**Architecture:** Pure renderer work over the already-shipped IPC surface (`mobileDoctor`, `listDevices`, `startDevice`, `startRecording({platform, deviceId})`, `runScenario(...opts)`). React + Zustand + react-router, CSS modules via `theme.css` (`.otl-*` BEM). No main-process changes except adding `deviceId` to the renderer-facing `runScenario`/`startRecording` typings and forwarding it (the main `RunOptions.deviceId` and recording `deviceId` already exist).

**Tech Stack:** React 18, react-router v6, Zustand, Vitest + Testing Library (jsdom), Biome.

## Global Constraints

- Shared modules bundled into Electron main must stay dependency-free — but this phase is renderer-only, so no constraint there beyond not importing main-only modules into the renderer.
- All user copy in **French** (match existing tone, e.g. "Démarrer l'enregistrement").
- CI gate = `npm run lint` (Biome) + `npm test` (Vitest) + `npm run build` (electron-vite) on macos/ubuntu/windows + E2E (Electron). No standalone `tsc` on tests in CI (a pre-existing unused-import warning in `tests/renderer/appGate.test.tsx` is out of gate).
- Reuse existing components: `Select` (`src/renderer/components/Select.tsx`), `.otl-btn-primary`, `.otl-input`, `.otl-field-label`, `.otl-platform`, `.otl-method`, `.otl-surface`.
- Hermetic tests: stub `window.api` on `globalThis`, mock `react-router-dom` hooks, set Zustand store via `useAppStore.setState`. Clean up in `afterEach`.
- Type values: `Platform = "web" | "responsive" | "mobile"`; `MobileApp = {appId, source: "installed"|"firebase", firebase?}`; `FirebaseAppDistConfig = {projectNumber, firebaseAppId, serviceAccountKeyPath}`; `MobileDevice = {id, name, kind, state}`; `MobileDoctorReport = {allOk, java, maestro, adb, studio, device}` where each is `DoctorCheck = {ok, label, version?, hint?}`.

**Execution as 3 sub-PRs (each CI-green before the next, auto-merge on green):**
- **6a** — Env "Applications" editor (Task 1). Leaf, no deps.
- **6b** — Mobile Doctor screen + route (Tasks 2–3). Leaf, no deps.
- **6c** — Mobile recording: device selector + deviceId wiring + auto-run + pre-flight + LiveRun fallback (Tasks 4–7).

---

## Task 1: Environment "Applications" editor (PR 6a)

**Files:**
- Modify: `src/renderer/screens/ProjectEnvironments.tsx`
- Test: `tests/renderer/projectEnvironments.test.tsx` (create if absent)
- Possibly extend: `src/renderer/theme.css` (reuse existing classes; only add if a new layout class is genuinely needed)

**Interfaces:**
- Consumes: `window.api.getProject`, `window.api.saveEnvironment(projectId, env)` (already used). `Environment.app?: MobileApp`.
- Produces: an editor that round-trips `Environment.app`.

Behavior: per env row, a "Application mobile" toggle (checkbox). When enabled, set `app = { appId: "", source: "installed" }`. Show an App ID text input bound to `app.appId`. Show a source choice (installed | firebase). When `source === "firebase"`, show three inputs bound to `app.firebase.{projectNumber, firebaseAppId, serviceAccountKeyPath}`. Disabling the toggle deletes `app` (set to `undefined`). `save()` already upserts each row via `saveEnvironment` — `app` flows through unchanged.

- [ ] **Step 1: Write the failing test** — `tests/renderer/projectEnvironments.test.tsx`

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectEnvironments from "../../src/renderer/screens/ProjectEnvironments";

vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => vi.fn(),
	useParams: () => ({ id: "p1" }),
}));

const saveEnvironment = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
	saveEnvironment.mockClear();
	(globalThis as unknown as { window: { api: unknown } }).window.api = {
		getProject: vi.fn().mockResolvedValue({
			id: "p1",
			name: "P",
			description: "",
			createdAt: "2026-06-26T00:00:00Z",
			environments: [
				{ id: "preprod", label: "Préprod", baseURL: "https://x", variables: {} },
			],
		}),
		saveEnvironment,
		deleteEnvironment: vi.fn().mockResolvedValue(undefined),
	};
});
afterEach(() => {
	Reflect.deleteProperty((globalThis as unknown as { window: Record<string, unknown> }).window, "api");
});

describe("ProjectEnvironments — application mobile", () => {
	it("active l'app, saisit l'appId et l'enregistre (source installed)", async () => {
		render(<ProjectEnvironments />);
		await screen.findByDisplayValue("Préprod");
		await userEvent.click(screen.getByLabelText(/application mobile/i));
		await userEvent.type(
			screen.getByPlaceholderText(/com\.exemple\.app/i),
			"com.ouigo.app",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /enregistrer les modifications/i }),
		);
		await waitFor(() =>
			expect(saveEnvironment).toHaveBeenCalledWith(
				"p1",
				expect.objectContaining({
					id: "preprod",
					app: { appId: "com.ouigo.app", source: "installed" },
				}),
			),
		);
	});

	it("source firebase → saisit et enregistre la config firebase", async () => {
		render(<ProjectEnvironments />);
		await screen.findByDisplayValue("Préprod");
		await userEvent.click(screen.getByLabelText(/application mobile/i));
		await userEvent.click(screen.getByRole("radio", { name: /firebase/i }));
		await userEvent.type(screen.getByPlaceholderText(/com\.exemple\.app/i), "com.ouigo.app");
		await userEvent.type(screen.getByPlaceholderText(/numéro de projet/i), "123");
		await userEvent.type(screen.getByPlaceholderText(/1:.*android/i), "1:123:android:abc");
		await userEvent.type(screen.getByPlaceholderText(/compte de service/i), "/k.json");
		await userEvent.click(screen.getByRole("button", { name: /enregistrer les modifications/i }));
		await waitFor(() =>
			expect(saveEnvironment).toHaveBeenCalledWith(
				"p1",
				expect.objectContaining({
					app: {
						appId: "com.ouigo.app",
						source: "firebase",
						firebase: {
							projectNumber: "123",
							firebaseAppId: "1:123:android:abc",
							serviceAccountKeyPath: "/k.json",
						},
					},
				}),
			),
		);
	});

	it("désactiver l'app supprime app de l'environnement", async () => {
		(globalThis as unknown as { window: { api: { getProject: ReturnType<typeof vi.fn> } } }).window.api.getProject =
			vi.fn().mockResolvedValue({
				id: "p1", name: "P", description: "", createdAt: "2026-06-26T00:00:00Z",
				environments: [{ id: "preprod", label: "Préprod", baseURL: "https://x", variables: {}, app: { appId: "com.ouigo.app", source: "installed" } }],
			});
		render(<ProjectEnvironments />);
		await screen.findByDisplayValue("Préprod");
		await userEvent.click(screen.getByLabelText(/application mobile/i)); // was checked → uncheck
		await userEvent.click(screen.getByRole("button", { name: /enregistrer les modifications/i }));
		await waitFor(() => {
			const arg = saveEnvironment.mock.calls[0][1];
			expect(arg.app).toBeUndefined();
		});
	});
});
```

- [ ] **Step 2: Run the test, verify it fails** — `npx vitest run tests/renderer/projectEnvironments.test.tsx` → FAIL (no "application mobile" control).

- [ ] **Step 3: Implement the editor** in `ProjectEnvironments.tsx`. After the URL input inside each `.otl-envrow` (or as a sub-block beneath the row), render:
  - A checkbox `<label><input type="checkbox" checked={!!r.app} onChange={toggle}/> Application mobile</label>` where toggle sets `app: e.target.checked ? { appId: "", source: "installed" } : undefined` via `updateRow`.
  - When `r.app`: an App ID input (`placeholder="com.exemple.app"`) bound to `r.app.appId`; a source choice with two `role="radio"` controls (or radio inputs) "Installée" / "Firebase" setting `app.source` (when switching to firebase, seed `firebase: { projectNumber:"", firebaseAppId:"", serviceAccountKeyPath:"" }`; when back to installed, drop `firebase`).
  - When `r.app.source === "firebase"`: three inputs (`placeholder` substrings: `numéro de projet`, `1:…:android:…`, `compte de service`) bound to the firebase sub-fields.
  - Update `app` immutably via a helper, e.g. `updateApp(envId, patch)` that merges into `r.app`.

- [ ] **Step 4: Run the test, verify it passes** — `npx vitest run tests/renderer/projectEnvironments.test.tsx` → PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx @biomejs/biome check --write src/renderer/screens/ProjectEnvironments.tsx tests/renderer/projectEnvironments.test.tsx
npx vitest run && npx @biomejs/biome check .
git add src/renderer/screens/ProjectEnvironments.tsx tests/renderer/projectEnvironments.test.tsx src/renderer/theme.css
git commit -m "feat(mobile) — éditeur d'application mobile par environnement (installed/firebase)"
```

---

## Task 2: Mobile Doctor screen (PR 6b)

**Files:**
- Create: `src/renderer/screens/MobileDoctor.tsx`
- Test: `tests/renderer/mobileDoctor.test.tsx`
- Modify: `src/renderer/App.tsx` (route)

**Interfaces:**
- Consumes: `window.api.mobileDoctor(): Promise<MobileDoctorReport>`, `window.api.startDevice(): Promise<{ok, error?}>`.
- Produces: a `/mobile/doctor` screen rendering the 5 checks with ✓/✗ + hints, a "Revérifier" button (re-runs `mobileDoctor`), and a "Démarrer un émulateur" button (calls `startDevice` then re-runs `mobileDoctor`).

- [ ] **Step 1: Write the failing test** — `tests/renderer/mobileDoctor.test.tsx`

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MobileDoctor from "../../src/renderer/screens/MobileDoctor";

const ok = (label: string) => ({ ok: true, label, version: "x" });
const bad = (label: string, hint: string) => ({ ok: false, label, hint });

const mobileDoctor = vi.fn();
const startDevice = vi.fn();
beforeEach(() => {
	mobileDoctor.mockReset();
	startDevice.mockReset();
	(globalThis as unknown as { window: { api: unknown } }).window.api = { mobileDoctor, startDevice };
});
afterEach(() => {
	Reflect.deleteProperty((globalThis as unknown as { window: Record<string, unknown> }).window, "api");
});

describe("MobileDoctor", () => {
	it("affiche les 5 contrôles et leurs conseils", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: false,
			java: ok("Java 17+"),
			maestro: bad("Maestro CLI", "Installe Maestro : curl -Ls …"),
			adb: ok("adb"),
			studio: ok("Maestro Studio"),
			device: bad("Appareil joignable", "Branche un téléphone ou démarre un émulateur."),
		});
		render(<MemoryRouter><MobileDoctor /></MemoryRouter>);
		expect(await screen.findByText("Java 17+")).toBeInTheDocument();
		expect(screen.getByText("Maestro CLI")).toBeInTheDocument();
		expect(screen.getByText(/Installe Maestro/)).toBeInTheDocument();
		expect(screen.getByText(/Branche un téléphone/)).toBeInTheDocument();
	});

	it("« Démarrer un émulateur » lance startDevice puis revérifie", async () => {
		mobileDoctor
			.mockResolvedValueOnce({ allOk: false, java: ok("Java 17+"), maestro: ok("Maestro CLI"), adb: ok("adb"), studio: ok("Maestro Studio"), device: bad("Appareil joignable", "…") })
			.mockResolvedValueOnce({ allOk: true, java: ok("Java 17+"), maestro: ok("Maestro CLI"), adb: ok("adb"), studio: ok("Maestro Studio"), device: ok("Appareil joignable") });
		startDevice.mockResolvedValue({ ok: true });
		render(<MemoryRouter><MobileDoctor /></MemoryRouter>);
		await screen.findByText("Java 17+");
		await userEvent.click(screen.getByRole("button", { name: /démarrer un émulateur/i }));
		await waitFor(() => expect(startDevice).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
	});
});
```

- [ ] **Step 2: Run the test, verify it fails** — `npx vitest run tests/renderer/mobileDoctor.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement `MobileDoctor.tsx`** — `useEffect` on mount runs `mobileDoctor()` into state; render a title + a list of the 5 checks (java, maestro, adb, studio, device) each as a row showing label, ✓/✗ glyph, `version` when present, and `hint` (only when `!ok`). A "Revérifier" button re-runs `mobileDoctor()`. A "Démarrer un émulateur" button: `await startDevice()` then re-run `mobileDoctor()`. Use `.otl-surface`/`.otl-card` styling. Keep a `loading` flag to disable buttons during calls. Guard against unmounted-after-async with a cancelled ref.

- [ ] **Step 4: Run the test, verify it passes** — `npx vitest run tests/renderer/mobileDoctor.test.tsx` → PASS.

- [ ] **Step 5: Commit (combined with Task 3).**

---

## Task 3: Route + entry point for Doctor (PR 6b)

**Files:**
- Modify: `src/renderer/App.tsx` (add `<Route path="/mobile/doctor" element={<MobileDoctor />} />`)
- Modify: `src/renderer/components/Sidebar.tsx` OR rely on a link from NewScenario (decide by reading Sidebar). Prefer a discreet entry; if Sidebar has a clear nav-item pattern, add "Diagnostic mobile".
- Test: extend `tests/renderer/mobileDoctor.test.tsx` only if route logic added; routing is usually integration — a render test of the screen suffices. If Sidebar nav is added, extend `tests/renderer/sidebar.test.tsx` to assert the new item count/label.

- [ ] **Step 1:** If adding Sidebar nav, write the failing assertion in `tests/renderer/sidebar.test.tsx` (item label "Diagnostic" present). Run → FAIL.
- [ ] **Step 2:** Add the route in `App.tsx` and the nav item in `Sidebar.tsx` (match existing item markup exactly). The Doctor is also reachable as a link from the mobile recording flow (Task 5).
- [ ] **Step 3:** Run `npx vitest run tests/renderer/sidebar.test.tsx` → PASS.
- [ ] **Step 4: Lint + commit + PR 6b**

```bash
npx @biomejs/biome check --write src/renderer/screens/MobileDoctor.tsx tests/renderer/mobileDoctor.test.tsx src/renderer/App.tsx src/renderer/components/Sidebar.tsx
npx vitest run && npx @biomejs/biome check .
git add -A && git commit -m "feat(mobile) — écran Diagnostic mobile (doctor) + route/navigation"
```

---

## Task 4: Add `deviceId` to renderer run/recording typings (PR 6c)

**Files:**
- Modify: `src/renderer/api.d.ts` (add `deviceId?: string` to `runScenario` opts — `startRecording` already has it)
- Modify: `src/preload/index.ts` (no change needed: `opts` is forwarded as-is; verify)
- No test (typing only); covered indirectly by Task 5/6 tests.

**Interfaces:**
- Produces: `runScenario(..., opts?: { headed?: boolean; specDraft?: string; deviceId?: string })`.

- [ ] **Step 1:** In `src/renderer/api.d.ts`, change the `runScenario` `opts` type to include `deviceId?: string`. Confirm `src/main/ipc/handlers.ts:handleRunScenario` already accepts `opts?: RunOptions` and `RunOptions.deviceId?` exists (it does).
- [ ] **Step 2:** Build sanity: `npx vitest run` (no regressions). Commit with Task 7 (do not PR alone).

---

## Task 5: Enable Mobile card + device selector + pre-flight (PR 6c)

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx`
- Test: `tests/renderer/newScenario.test.tsx` (extend; create cases for the mobile path)

**Interfaces:**
- Consumes: `window.api.listDevices(): Promise<MobileDevice[]>`, `window.api.startDevice()`, `window.api.startRecording({...platform:"mobile", deviceId})`, the env list (to read `inheritedEnv.app`).
- Produces: a working mobile recording entry that passes `deviceId` and blocks start until prerequisites hold.

Behavior:
- Convert the Mobile card from a disabled `<div>` to a `<button>` that `setPlatform("mobile")` (mirror the Web/Responsive card markup incl. the selected check, remove `--disabled`/`title="Bientôt"`/`soon-pill`).
- When `platform === "mobile"`: render a device `Select` populated from `listDevices()` (label `name` + state), a "Démarrer un émulateur" button (`startDevice()` then refresh devices), and a link/button to `/mobile/doctor`.
- Load devices in a `useEffect` when `platform === "mobile"` (and on demand after `startDevice`).
- **Pre-flight (carryover 1):** the inherited env must have `app?.appId` AND a device must be selected. When unmet, disable "Démarrer l'enregistrement" and show an inline note (e.g. "Configure une application mobile sur l'environnement" / "Sélectionne un appareil"). The existing `disabled={!name.trim()}` extends to `|| (platform==="mobile" && (!hasApp || !deviceId))`.
- `handleStart` passes `deviceId` when mobile.

- [ ] **Step 1: Write failing tests** — add to `tests/renderer/newScenario.test.tsx`:

```tsx
it("plateforme mobile : sans app sur l'env → démarrage bloqué avec message", async () => {
	// env without app; listDevices returns one booted device
	// after selecting Mobile card, the start button is disabled and a hint shows
});

it("plateforme mobile : app + device → startRecording reçoit platform mobile + deviceId", async () => {
	// env with app {appId, source installed}; listDevices → [{id:"emulator-5554", name, kind, state:"booted"}]
	// click Mobile card, pick device, type name, click start
	// expect startRecording called with platform:"mobile", deviceId:"emulator-5554"
});
```

Fill these in concretely using the existing `newScenario.test.tsx` stub style (stub `listDevices`, `startDevice`, `startRecording`; set env via `listEnvironments` returning `[{id:"preprod",...,app:{appId:"com.ouigo.app",source:"installed"}}]` and `useAppStore.setState({ activeProjectId:"default", activeEnvByProject:{default:"preprod"} })`).

- [ ] **Step 2:** Run → FAIL (mobile card disabled, no device select).
- [ ] **Step 3:** Implement the mobile card + device selector + pre-flight + `handleStart` deviceId.
- [ ] **Step 4:** Run `npx vitest run tests/renderer/newScenario.test.tsx` → PASS.
- [ ] **Step 5:** Commit with Task 6/7.

---

## Task 6: Auto-run mobile recording with deviceId (PR 6c)

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx` (`handleStop`)
- Test: `tests/renderer/newScenario.test.tsx`

**Interfaces:**
- Consumes: `stopRecording → Scenario`, `runScenario(projectId, tunnelId, scenarioId, envId, { deviceId })`.

Behavior: `handleStop` already auto-runs after stop. For a mobile scenario (`scenario.platform === "mobile"`), pass `{ deviceId }` to `runScenario` so the maestroRunner targets the device. Keep the existing web behavior unchanged.

- [ ] **Step 1: Write failing test** — mobile stop → `runScenario` called with `{ deviceId: "emulator-5554" }` as the 5th arg. Run → FAIL.
- [ ] **Step 2:** Pass `scenario.platform === "mobile" ? { deviceId } : undefined` to `runScenario`.
- [ ] **Step 3:** Run → PASS.

---

## Task 7: LiveRun report-on-mount terminal fallback (PR 6c, carryover 2)

**Files:**
- Modify: `src/renderer/screens/LiveRun.tsx`
- Test: `tests/renderer/liveRun.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `window.api.getReport(runId): Promise<Report>` (rejects if not yet persisted), `window.api.onRunEvent`.
- Produces: LiveRun navigates to `/report/:runId` if the run already finished before the screen subscribed (guard-path / instant-finish race).

Behavior: inside the existing subscribe `useEffect`, **after** `const unsub = window.api.onRunEvent(...)`, call `window.api.getReport(runId)`. If it resolves with a terminal status (`passed | failed | cancelled` — i.e. not `running`/`never`), set `finishedRef.current = true` and `navigate(\`/report/${runId}\`)`. If it rejects (report not persisted yet → run still in progress), ignore and rely on streamed events. Subscribe-before-query ordering guarantees no lost-finish window (saveReport precedes the run-finished emit). Guard with a `cancelled` flag to avoid navigate-after-unmount.

- [ ] **Step 1: Write failing test** — `tests/renderer/liveRun.test.tsx`

```tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LiveRun from "../../src/renderer/screens/LiveRun";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => { navigateMock.mockReset(); });
afterEach(() => {
	Reflect.deleteProperty((globalThis as unknown as { window: Record<string, unknown> }).window, "api");
});

function renderAt(runId: string) {
	return render(
		<MemoryRouter initialEntries={[`/run/${runId}`]}>
			<Routes><Route path="/run/:runId" element={<LiveRun />} /></Routes>
		</MemoryRouter>,
	);
}

describe("LiveRun — repli rapport au montage", () => {
	it("rapport déjà terminé au montage → navigue vers le rapport", async () => {
		(globalThis as unknown as { window: { api: unknown } }).window.api = {
			onRunEvent: vi.fn().mockReturnValue(() => {}),
			getReport: vi.fn().mockResolvedValue({ runId: "r1", status: "passed" }),
		};
		renderAt("r1");
		await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/report/r1"));
	});

	it("rapport absent (course en cours) → reste sur l'écran live", async () => {
		(globalThis as unknown as { window: { api: unknown } }).window.api = {
			onRunEvent: vi.fn().mockReturnValue(() => {}),
			getReport: vi.fn().mockRejectedValue(new Error("Report not found")),
		};
		renderAt("r2");
		await new Promise((r) => setTimeout(r, 50));
		expect(navigateMock).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2:** Run → FAIL (no getReport-on-mount).
- [ ] **Step 3:** Implement the fallback in the subscribe effect (subscribe first, then `getReport`, terminal → navigate; `cancelled` guard).
- [ ] **Step 4:** Run `npx vitest run tests/renderer/liveRun.test.tsx` → PASS.
- [ ] **Step 5: Full suite + lint + commit + PR 6c**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer
npx vitest run && npx @biomejs/biome check .
git add -A
git commit -m "feat(mobile) — enregistrement mobile : sélecteur d'appareil, deviceId, auto-run, pré-vol + repli rapport LiveRun"
```

---

## Self-Review

- **Spec coverage:** Mobile card enable (T5), Applications env editor (T1), device selector + emulator boot (T5, T2), doctor screen (T2–T3), deviceId into runs+recording (T4–T6), auto-run after recording (T6), pre-flight validation (T5), LiveRun report-on-mount fallback (T7). All covered.
- **Placeholder scan:** Test bodies for T5/T6 are described as fill-ins using the existing `newScenario.test.tsx` stub style — concretize them at implementation using the documented stubs (listEnvironments with `app`, listDevices, startRecording, runScenario). No TBDs in production steps.
- **Type consistency:** `MobileApp`, `FirebaseAppDistConfig`, `MobileDevice`, `MobileDoctorReport`/`DoctorCheck` used verbatim from `src/shared/types.ts`. `runScenario` opts gains `deviceId?: string` consistent with `RunOptions.deviceId`.
