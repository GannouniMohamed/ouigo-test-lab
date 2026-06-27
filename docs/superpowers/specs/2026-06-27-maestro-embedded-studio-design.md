# Maestro Embedded Studio — Auto-capture Recording (Design)

**Status:** Draft for review
**Date:** 2026-06-27
**Author:** Claude (with M. Gannouni)
**Builds on:** the zero-install web-Studio recording (PR #161) and the mobile quality hardening (PR #162).

## Overview

Today, recording a mobile scenario is "paste-the-flow": the app spawns `maestro studio --no-window` (web Studio on `http://localhost:9999`), opens it in the user's **external browser**, the PO records, clicks **Copy**, then **manually pastes** the YAML back into the app. This design removes the manual copy-paste by **embedding the Studio inside an app-owned window** and **auto-capturing the recorded flow** off the Studio's own HTTP API.

The PO records exactly as before, but the flow lands in the app automatically — no clipboard round-trip.

## Goals

- Eliminate the manual paste step for mobile recording.
- Keep the recording experience inside the app (one window, no external browser).
- Be robust: never regress below today's behaviour — manual paste remains as a guaranteed fallback.
- Stay pinned to the app-managed Maestro **2.5.1** (the only version with the web Studio); pinning makes the internal Studio API a stable target.

## Non-Goals

- No change to the **run** path, report mapping, or Firebase/app-install logic.
- No change to web (Playwright) recording.
- No attempt to support Maestro versions other than the managed 2.5.1.
- No iOS.

## Verified facts (Studio 2.5.1 HTTP API)

Confirmed live against the managed binary + an Android emulator:

- The Studio frontend is a SPA served from `http://localhost:9999`; its bundle calls a small REST API. Real endpoints (extracted from the bundle):
  - `POST /api/run-command  {yaml, dryRun}` — runs **one** command; fired as the PO drives the device mirror.
  - `POST /api/format-flow  {commands}` — turns the **full client-side command list** into clean YAML. **This is exactly what the "Copy" button calls.**
  - `GET  /api/device-screen/sse`, `GET /api/last-view-hierarchy`, `POST /api/auth/...` — not needed here.
- The authoritative recorded flow lives in the **browser (React state)**; the server is stateless about "the recording". The only moment the complete flow is serialised to the wire is the **`/api/format-flow` call** (i.e. when the user clicks Copy).

**Design consequence:** intercepting `/api/format-flow` yields the *authoritative complete flow*; intercepting `/api/run-command` yields a *best-effort live stream* that may omit commands that were added to the panel but not individually run. Therefore `/api/format-flow` is the primary capture source.

## Architecture

A parallel change to the existing recorder, keeping `maestroRecorder.ts` **electron-free** (unit-test constraint). All Electron/window code lives in new injected modules.

```
NewScenario (renderer)
  │ recording:start (mobile, deviceId)
  ▼
maestroRecorder.startRecording (main, electron-free)
  ├─ ensureManagedMaestro → ensureAppOnDevice → spawn studio → waitForPort
  └─ deps.openStudio(url, { onFlowCaptured, onClosed })   ← was deps.openExternal(url)
        ▼
   studioWindow.ts (NEW, electron)  ── creates a BrowserWindow loading localhost:9999
        with preload studioPreload.ts (NEW) which patches window.fetch:
          • on POST /api/format-flow  → capture request body / response YAML → ipc "studio:flow"
          • on POST /api/run-command  → capture yaml → ipc "studio:command" (best-effort live)
        studioWindow forwards those ipc events to the onFlowCaptured / onCommand callbacks.

maestroRecorder keeps, per recordingId:
  - capturedFlow: string | undefined   (latest format-flow result — authoritative)
  - capturedCommands: string[]         (best-effort live stream — fallback assembly)

NewScenario "Terminer l'enregistrement"
  │ recording:stop(recordingId)        (no pastedFlow)
  ▼
maestroRecorder.stopRecording(recordingId, pastedFlow?)
  resolve flow source, in priority order:
    1. pastedFlow (explicit manual fallback, if provided)
    2. capturedFlow (authoritative, from format-flow interception)
    3. formatFlow(capturedCommands) via POST /api/format-flow (assemble from live stream)
    4. → throw "Aucune étape détectée…" (same guard as today)
  then: rebaseFlowAppId → saveScenario → close studio window → return { scenario, flowText }

NewScenario shows the captured flowText READ-ONLY → "Lancer" confirm → runScenario.
```

### New / changed modules

- **`src/main/recorder/studioWindow.ts`** (NEW, imports electron; not unit-tested, injected). `openStudioWindow(url, { onFlow, onCommand, onClosed }): StudioWindowHandle` where the handle has `close()`. Creates a `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `preload: studioPreload`. Wires the window's `webContents` IPC (`studio:flow`, `studio:command`) to the callbacks; `onClosed` on window `closed`.
- **`src/preload/studioPreload.ts`** (NEW). Runs before page scripts; monkey-patches `window.fetch`. Uses a pure helper (below) to classify each request; forwards captures via `ipcRenderer.send`. Exposes nothing else to the page.
- **`src/main/recorder/studioCapture.ts`** (NEW, pure, unit-tested). `classifyStudioRequest(method, url, requestBody, responseText) → { kind: "flow", yaml } | { kind: "command", yaml } | null`. This is the testable heart of the interception (no Electron, no network).
- **`src/main/recorder/formatFlow.ts`** (NEW, unit-tested with injected fetch). `formatFlow(commands: unknown[], deps?) → Promise<string>` → `POST localhost:9999/api/format-flow`.
- **`src/main/recorder/maestroRecorder.ts`** (CHANGED). Replace `deps.openExternal` with `deps.openStudio`; add per-recording capture buffers fed by the callbacks; extend `stopRecording` flow-source resolution (above). Keep `cancelRecording` (also closes the window). Stays electron-free (window via injected dep, formatFlow via injected dep).
- **`src/renderer/screens/NewScenario.tsx`** (CHANGED). Mobile branch: while recording, show "Terminer l'enregistrement" / "Annuler" (no paste textarea by default). On stop, show the captured flow **read-only** with a **"Lancer"** confirm (Decision 3). If capture yielded nothing, reveal the **manual paste fallback** (today's textarea + Copy instructions) and let the PO paste, then "Créer le scénario".

## The three approved decisions

1. **Embedding mechanism → child `BrowserWindow`** (not an inline `<webview>`). Isolates the third-party Studio UI; simplest lifecycle; no React-layout entanglement.
2. **Manual paste kept as fallback.** If interception captures nothing (API drift, fetch bypass, user closed early), the PO can still Copy→paste exactly as today. The feature can never be *worse* than the current behaviour.
3. **Confirm before run.** After capture, show the flow read-only and require an explicit "Lancer". Consistent with the run-failure "Réessayer" affordance added in PR #162; lets the PO see what was captured before executing.

## Data flow (happy path)

1. PO: NewScenario → Mobile → device → name → **Démarrer l'enregistrement**.
2. App ensures binary + app-on-device, spawns Studio, waits for port, opens the **in-app Studio window**.
3. PO records on the device mirror; when satisfied, clicks **Copy** in the Studio (or our "Terminer" triggers the export — see Risk R1). The `format-flow` call is intercepted → authoritative YAML captured.
4. PO clicks **Terminer l'enregistrement** in the app → `stopRecording` builds the scenario from the captured flow, rebases the appId, saves, closes the Studio window.
5. App shows the captured flow read-only → PO clicks **Lancer** → run + LiveRun.

## Error handling

| Situation | Behaviour |
|---|---|
| Studio doesn't start (port timeout) | existing French error, process killed (unchanged) |
| Window closed by PO mid-recording | treated as **cancel** (onClosed → cancelRecording); no scenario |
| Capture empty at Terminer | reveal manual paste fallback with instructions (no data loss) |
| `format-flow` assembly fails | fall back to captured authoritative flow if any, else paste fallback |
| App-on-device / Firebase failure at start | existing French error (unchanged) |
| App quit during recording | `before-quit` killAllRecordings (PR #162) also closes the Studio window |

## Security

- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no `webSecurity` downgrade. The preload exposes only `ipcRenderer.send` for the two capture channels — nothing to the page.
- Only `http://localhost:9999` (the local Java Studio server, our own spawned process) is loaded; the window refuses navigation away from localhost.
- The preload never injects anything readable by the page; it only observes `fetch`.

## Testing strategy

- **`studioCapture.ts`** (pure): unit-test `classifyStudioRequest` — format-flow request/response → `{kind:"flow",yaml}`; run-command → `{kind:"command",yaml}`; unrelated requests / GET / SSE → `null`; malformed bodies → `null` (no throw).
- **`formatFlow.ts`**: unit-test with injected fetch — correct URL/method/body shape; maps response to YAML; surfaces HTTP errors in French.
- **`maestroRecorder.ts`**: unit-test stop flow-source priority (pasted > capturedFlow > assembled > throw) with injected `openStudio` + `formatFlow`; cancel/onClosed closes the window; buffers cleared per recording; **manual paste fallback still works** (regression guard); appId rebase preserved.
- **`studioWindow.ts`** / **`studioPreload.ts`**: not unit-tested (Electron/DOM); covered by the injected-deps seam and a manual live test with the repaired 2.5.1 binary via `OTL_MAESTRO_BIN`.
- **`NewScenario.tsx`**: render tests for the new mobile flow (Terminer → read-only flow → Lancer → run), and the empty-capture → paste-fallback path; happy-path auto behaviours preserved.
- **CI**: biome lint + vitest + electron-vite build green on all three OS; no `import "electron"` in unit-tested main modules; no new npm deps.

## Risks

- **R1 — Capture trigger timing (KEY RISK).** `/api/run-command` may fire only for *executed* commands, not every recorded one; the authoritative flow is only serialised on `/api/format-flow` (Copy). **Mitigation:** primary source is the `format-flow` interception (so the trigger is the PO clicking **Copy** inside the embedded Studio); we will evaluate, during the implementation spike, whether our **Terminer** button can programmatically invoke the Studio export (synthesised Copy) so the PO needn't click Copy at all. If that proves fragile, the shipped UX is "record → click **Copy** in the Studio (we auto-capture, no paste) → **Terminer**". Either way, manual paste remains the fallback. **The plan's first task is a verification spike to lock this down before building the window.**
- **R2 — Studio internal API drift.** Mitigated by pinning to managed 2.5.1.
- **R3 — `fetch` monkey-patch fragility** (e.g. Studio uses `XMLHttpRequest` or a worker). Spike verifies it; paste fallback covers it.
- **R4 — Electron window security** with a localhost SPA. Addressed by the hardened `BrowserWindow` settings above.

## Open questions for review

1. **R1 trade-off:** is "click **Copy** in the embedded Studio (auto-captured, no paste)" acceptable as the shipped interaction if synthesising the export from our **Terminer** button proves fragile? (Recommended: yes — it already removes the paste round-trip, which is the painful part.)
2. **Window style:** separate child window (recommended) vs. a maximised modal that feels in-app? (Cosmetic; can decide at implementation.)
