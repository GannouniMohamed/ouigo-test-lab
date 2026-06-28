# Maestro Embedded Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task is TDD (red→green→commit). Spec: `docs/superpowers/specs/2026-06-27-maestro-embedded-studio-design.md`.

**Goal:** Remove the manual copy-paste from mobile recording by embedding Maestro Studio in an app-owned window and reading the recorded flow from the OS clipboard after the PO clicks Copy.

**Architecture:** Studio is opened in a hardened Electron `BrowserWindow` (instead of the external browser). When the PO clicks "Terminer", the main process reads the OS clipboard; `normalizeFlow` rebuilds a valid `appId:\n---\n…` flow; the scenario is saved and shown read-only for an explicit "Lancer". `maestroRecorder.ts` stays electron-free (window + clipboard behind injected deps with lazy-`require` defaults). Manual paste is retained as a fallback.

**Tech Stack:** Electron + React + TypeScript, vitest, Biome. CI = `npm run lint` + `npm test` + `npm run build`.

## Global Constraints
- French UI copy for everything user-facing.
- No `import "electron"` at module top-level in unit-tested main modules (`maestroRecorder.ts`). Electron access only via lazy `require("electron")` inside default-dep functions (mirror `src/main/workspace.ts`'s `getWorkspaceDir` pattern) or in the dedicated non-unit-tested `studioWindow.ts`.
- `src/shared/flow.ts` stays dependency-free (no yaml lib).
- `OTL_MAESTRO_BIN` / `OTL_SKIP_STUDIO_LAUNCH` seams must keep working.
- No new npm dependency.
- Every behaviour change is driven by a failing test first (TDD).
- Resolved open questions (spec): (Q1) **confirm before run** — mobile stop saves but does NOT auto-run; the captured flow is shown read-only with a "Lancer" button. (Q2) **separate child `BrowserWindow`**.
- Commit messages end with the two repo trailers (Co-Authored-By + Claude-Session).
- Each task leaves `npm run lint && npm test` green.

## File Structure
- `src/shared/flow.ts` — add pure `normalizeFlow(raw, appId)`. (Task 1)
- `src/main/recorder/studioWindow.ts` — NEW, Electron `BrowserWindow` opener. (Task 2)
- `src/main/recorder/maestroRecorder.ts` — embedded window + clipboard capture. (Task 2)
- `src/renderer/screens/NewScenario.tsx` — embedded recording UX + read-only confirm. (Task 3)
- Tests: `tests/main/flowNormalize.test.ts` (new), `tests/main/maestroRecorder.test.ts` (update), `tests/renderer/newScenario.test.tsx` (update).

---

### Task 1: `normalizeFlow` in shared/flow.ts

**Files:**
- Modify: `src/shared/flow.ts`
- Test: `tests/main/flowNormalize.test.ts` (new)

**Interfaces:**
- Produces: `export function normalizeFlow(raw: string, appId: string): string` — returns a valid Maestro flow `appId: <appId>\n---\n<commands>\n`, regardless of whether `raw` is commands-only (Studio Copy output), a full flow with `appId:`+`---`, or the latent-bug case (`appId:` but no `---`).

- [ ] **Step 1: Write failing tests** — `tests/main/flowNormalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeFlow, parseFlowSteps } from "../../src/shared/flow";

describe("normalizeFlow", () => {
  it("commands-only (Studio Copy) → ajoute l'en-tête appId + ---", () => {
    const raw = "- tapOn:\n    id: a\n- tapOn: Bordeaux\n";
    const out = normalizeFlow(raw, "com.ouigo.app");
    expect(out).toBe("appId: com.ouigo.app\n---\n- tapOn:\n    id: a\n- tapOn: Bordeaux\n");
    expect(parseFlowSteps(out).length).toBe(2);
  });

  it("flow déjà complet → rebase l'appId, un seul ---", () => {
    const raw = "appId: ancien\n---\n- launchApp\n- tapOn: X\n";
    const out = normalizeFlow(raw, "com.new");
    expect(out).toBe("appId: com.new\n---\n- launchApp\n- tapOn: X\n");
    expect((out.match(/^---$/gm) || []).length).toBe(1);
  });

  it("appId mais pas de --- (bug latent) → insère le séparateur", () => {
    const raw = "appId: ancien\n- tapOn: X\n";
    const out = normalizeFlow(raw, "com.new");
    expect(out).toBe("appId: com.new\n---\n- tapOn: X\n");
  });

  it("entrée vide → corps vide (0 étape, le garde-fou appelant rejette)", () => {
    expect(parseFlowSteps(normalizeFlow("   ", "com.x")).length).toBe(0);
  });

  it("CRLF normalisé", () => {
    const out = normalizeFlow("- tapOn: A\r\n- tapOn: B\r\n", "com.x");
    expect(out).toBe("appId: com.x\n---\n- tapOn: A\n- tapOn: B\n");
  });
});
```

- [ ] **Step 2: Run red** — `npx vitest run tests/main/flowNormalize.test.ts` → fails (normalizeFlow undefined).

- [ ] **Step 3: Implement** in `src/shared/flow.ts` (reuse the existing `toLines`, `SEPARATOR_RE`, `APPID_RE`):

```ts
// Reconstruit un flow Maestro valide à partir d'un contenu hétérogène :
// - sortie « Copy » du Studio (commandes seules, sans en-tête),
// - flow complet (appId + --- + commandes),
// - cas « appId sans --- » (bug latent de rebaseFlowAppId).
// Garantit toujours `appId: <appId>\n---\n<corps>\n`.
export function normalizeFlow(raw: string, appId: string): string {
  const lines = toLines(raw);
  const sep = lines.findIndex((l) => SEPARATOR_RE.test(l));
  const bodyLines =
    sep !== -1 ? lines.slice(sep + 1) : lines.filter((l) => !APPID_RE.test(l));
  const body = bodyLines.join("\n").trim();
  return `appId: ${appId}\n---\n${body}\n`;
}
```

- [ ] **Step 4: Run green** — `npx vitest run tests/main/flowNormalize.test.ts` → PASS.
- [ ] **Step 5: Lint + commit** — `npx biome check --write src/shared/flow.ts tests/main/flowNormalize.test.ts`; `npm test`; commit `feat(flow): normalizeFlow rebuilds a valid appId/--- header`.

---

### Task 2: Embedded Studio window + clipboard capture (maestroRecorder)

**Files:**
- Create: `src/main/recorder/studioWindow.ts`
- Modify: `src/main/recorder/maestroRecorder.ts`
- Test: `tests/main/maestroRecorder.test.ts`

**Interfaces:**
- Consumes: `normalizeFlow` (Task 1).
- Produces:
  - `studioWindow.ts`: `export function openStudioWindow(url: string, opts: { onClosed: () => void }): { close: () => void }`.
  - `maestroRecorder.startRecording(opts, deps?)` — `deps` gains `openStudio?: (url, { onClosed }) => { close: () => void }` (REPLACES `openExternal`).
  - `maestroRecorder.stopRecording(recordingId, pastedFlow?, deps?)` — `deps` gains `readClipboard?: () => string`.

#### 2a — studioWindow.ts (Electron; not unit-tested, injected)

- [ ] **Step 1: Create `src/main/recorder/studioWindow.ts`:**

```ts
import { BrowserWindow } from "electron";

// Ouvre Maestro Studio dans une fenêtre de l'app (durcie). Aucune surface
// node/IPC exposée à la page ; navigation hors localhost bloquée. Non couvert
// en unitaire (Electron) — injecté via deps dans le recorder.
export function openStudioWindow(
  url: string,
  opts: { onClosed: () => void },
): { close: () => void } {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "Maestro Studio — Enregistrement",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Bloque toute navigation hors du serveur Studio local.
  win.webContents.on("will-navigate", (e, target) => {
    if (!target.startsWith("http://localhost:9999")) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  let closedNotified = false;
  win.on("closed", () => {
    if (!closedNotified) {
      closedNotified = true;
      opts.onClosed();
    }
  });
  void win.loadURL(url);
  return {
    close: () => {
      closedNotified = true; // close programmatique → pas de onClosed (évite la double-annulation)
      if (!win.isDestroyed()) win.close();
    },
  };
}
```

#### 2b — maestroRecorder.ts changes

- [ ] **Step 2: Write/adjust failing tests** in `tests/main/maestroRecorder.test.ts`. Update `fakeDeps` and add cases. New `fakeDeps` shape:

```ts
function fakeDeps() {
  const kill = vi.fn();            // process Studio
  const close = vi.fn();           // fenêtre embarquée
  let onClosed = () => {};
  return {
    kill, close,
    fireWindowClosed: () => onClosed(),
    deps: {
      ensureMaestro: vi.fn(async () => ({ bin: "/fake/maestro" })),
      spawnStudio: vi.fn(() => ({ pid: 4242, kill })),
      waitForPort: vi.fn(async () => {}),
      openStudio: vi.fn((_url: string, o: { onClosed: () => void }) => {
        onClosed = o.onClosed;
        return { close };
      }),
    },
  };
}
```

  Required test cases (TDD):
  - **start opens the embedded window** (not external): `openStudio` called with `"http://localhost:9999"` and an `onClosed` fn; `ensureMaestro`+`waitForPort` still called.
  - **stop via clipboard** (no `pastedFlow`): inject `{ readClipboard: () => "- tapOn:\n    id: x\n- tapOn: Y\n" }`; assert the saved scenario has `recordedStepCount === 2`, the saved spec contains `appId: com.ouigo.app` and `---`, and BOTH `kill` (process) and `close` (window) were called once.
  - **stop prefers explicit pastedFlow over clipboard**: pass a pasted full flow AND a clipboard that differs; assert the pasted content wins.
  - **stop with empty clipboard and no paste** → rejects `/étape/i`, and NEITHER `kill` nor `close` called (validate-before-close, #8 preserved); a subsequent stop with a valid clipboard succeeds.
  - **window closed by user** (`fireWindowClosed()`) → the session is cancelled: a later `stopRecording` rejects `/introuvable/i`, and `kill`+`close` fired.
  - Keep existing tests (timeout → process killed; sans deviceId; env sans app; dedup) working — rename `openExternal` usages to `openStudio`.

- [ ] **Step 3: Run red** — `npx vitest run tests/main/maestroRecorder.test.ts`.

- [ ] **Step 4: Implement** in `src/main/recorder/maestroRecorder.ts`:

  (a) Replace the `defaultOpenExternal` function with lazy-require defaults:

```ts
// Ouvre Studio dans une fenêtre de l'app (lazy require → module reste
// electron-free à l'import ; les tests injectent openStudio).
function defaultOpenStudio(
  url: string,
  opts: { onClosed: () => void },
): { close: () => void } {
  // biome-ignore lint/style/useImportType: require dynamique pour rester electron-free
  const { openStudioWindow } = require("./studioWindow");
  return openStudioWindow(url, opts);
}

// Lit le presse-papier OS (sortie du bouton Copy du Studio). Lazy require.
function defaultReadClipboard(): string {
  try {
    return require("electron").clipboard.readText() ?? "";
  } catch {
    return "";
  }
}
```

  (b) In `startRecording`: change the `deps` type — remove `openExternal`, add
  `openStudio?: (url: string, opts: { onClosed: () => void }) => { close: () => void }`.
  Replace the launch block so the session kill closes BOTH process and window, and a user-closed window cancels the recording:

```ts
const recordingId = randomUUID();
let kill: () => void = () => {};

if (process.env.OTL_SKIP_STUDIO_LAUNCH !== "1") {
  const spawnStudio = deps?.spawnStudio ?? defaultSpawnStudio;
  const waitForPort = deps?.waitForPort ?? defaultWaitForPort;
  const openStudio = deps?.openStudio ?? defaultOpenStudio;
  const handle = spawnStudio(bin, opts.deviceId);
  try {
    await waitForPort(STUDIO_URL, STUDIO_TIMEOUT_MS);
  } catch {
    handle.kill();
    throw new Error(
      "Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie.",
    );
  }
  const win = openStudio(STUDIO_URL, {
    onClosed: () => maestroRecorder.cancelRecording(recordingId),
  });
  kill = () => {
    handle.kill();
    win.close();
  };
}

activeRecordings.set(recordingId, { /* …unchanged fields… */, kill });
return { recordingId };
```

  (c) Change `stopRecording` signature to accept `deps?: { readClipboard?: () => string }` and resolve the flow source (pasted > clipboard) then normalize:

```ts
async stopRecording(
  recordingId: string,
  pastedFlow?: string,
  deps?: { readClipboard?: () => string },
): Promise<Scenario> {
  const session = activeRecordings.get(recordingId);
  if (!session)
    throw new Error(
      `Session d'enregistrement introuvable (${recordingId}) — elle a peut-être déjà été arrêtée ou annulée.`,
    );

  const pasted = (pastedFlow ?? "").trim();
  const raw = pasted || (deps?.readClipboard ?? defaultReadClipboard)().trim();
  const flow = normalizeFlow(raw, session.appId);

  // #8 valider AVANT de tuer/fermer : 0 étape → on laisse la session pour réessayer.
  if (parseFlowSteps(flow).length === 0) {
    throw new Error(
      "Aucune étape détectée — enregistre dans le Studio, clique Copy, puis Terminer.",
    );
  }

  session.kill(); // stoppe le serveur Studio ET ferme la fenêtre
  activeRecordings.delete(recordingId);

  const steps = parseFlowSteps(flow);
  // …reste inchangé (uniqueId, scenario, saveScenario(scenario, flow))…
}
```

  Remove the now-unused `rebaseFlowAppId` import if no longer referenced; add `normalizeFlow` to the import from `../../shared/flow`.

- [ ] **Step 5: Run green** — `npx vitest run tests/main/maestroRecorder.test.ts`, then `npm test`.
- [ ] **Step 6: Lint + commit** — `npx biome check --write` on touched files; commit `feat(recorder): embedded Studio window + clipboard capture`.

---

### Task 3: NewScenario embedded recording UX

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx`
- Test: `tests/renderer/newScenario.test.tsx`

**Interfaces:**
- Consumes: `window.api.stopRecording(id, pastedFlow?)` (unchanged IPC — when `pastedFlow` is omitted, main reads the clipboard), `window.api.runScenario`.

**Behaviour:** mobile recording no longer centres on the paste textarea.
- While `recordingId !== null`: show the device/Studio hint "Enregistre dans la fenêtre Maestro Studio, clique **Copy**, puis **Terminer**.", a primary **"Terminer l'enregistrement"** button, an **"Annuler"** button, and a collapsible **"Coller manuellement"** fallback that reveals today's `pastedFlow` textarea.
- `handleStop` (mobile): call `window.api.stopRecording(recordingId, pastedFlow.trim() || undefined)` — clipboard path when the fallback box is empty. **Do NOT auto-run** (Q1 = confirm before run): on success, store `savedScenario`/`savedEnv`, set a new `capturedFlowText` state from the returned scenario's spec (or re-read via an existing API if needed), set `recordingId=null`, and render the captured flow **read-only** with a **"Lancer"** button that calls the existing `handleRetry` run logic (rename/relabel `handleRetry` to a shared `runSavedScenario`). Web recording keeps its current auto-run path unchanged.
- Empty-capture handling: if `stopRecording` rejects with the "Aucune étape" error, show that French message and auto-reveal the manual paste fallback.

- [ ] **Step 1: Write failing tests** in `tests/renderer/newScenario.test.tsx` (mock `window.api.stopRecording` / `runScenario`):
  - **mobile Terminer uses clipboard path**: start a mobile recording, click "Terminer l'enregistrement" with the paste box empty → assert `stopRecording` called with `(recordingId, undefined)`.
  - **confirm before run**: after a successful `stopRecording`, assert `runScenario` was NOT called yet, the captured flow is shown read-only, and a "Lancer" button is present; clicking "Lancer" calls `runScenario` and navigates.
  - **manual fallback**: when the paste box has content, "Terminer" passes it as `pastedFlow`; when `stopRecording` rejects with /étape/, the paste fallback is revealed.
  - Keep the existing retry-after-run-failure test green (rename if the handler name changes).

- [ ] **Step 2: Run red** — `npx vitest run tests/renderer/newScenario.test.tsx`.
- [ ] **Step 3: Implement** the state (`capturedFlowText`, `awaitingRun`), the `handleStop` change (no auto-run for mobile; pass `pastedFlow.trim() || undefined`), the read-only flow + "Lancer" rendering, and the collapsible manual-paste fallback. Reuse existing `runFailed`/`savedScenario`/`handleRetry` wiring for the run + retry path. Keep all copy French; use existing `--otl-*` tokens.
- [ ] **Step 4: Run green** — `npx vitest run tests/renderer/newScenario.test.tsx`, then `npm test`.
- [ ] **Step 5: Lint + commit** — `npx biome check --write` touched files; commit `feat(renderer): embedded-Studio recording flow (Terminer → confirm → Lancer)`.

---

## Live verification (after Task 3, before PR)
With the repaired 2.5.1 binary via `OTL_MAESTRO_BIN`, run `npm run dev`, record a mobile scenario in the embedded window, click Copy → Terminer, confirm the captured flow appears and "Lancer" runs it. (Manual; not a CI gate.)

## Self-review notes
- Spec coverage: clipboard capture (Task 2), embedded window (Task 2 + studioWindow), normalizeFlow/latent-`---` fix (Task 1), confirm-before-run + fallback (Task 3). ✓
- Type consistency: `openStudio`/`{close}` and `readClipboard` deps match between recorder and tests; `normalizeFlow(raw, appId)` signature stable across tasks. ✓
- Deferred (note for final review): no renderer push-notification when the user closes the embedded window (the session is cancelled; a later Terminer shows the French "introuvable" error). Acceptable for v1; a `recording:closed` push event is a possible follow-up.
