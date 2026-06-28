# Maestro Embedded Studio — Auto-capture Recording (Design)

**Status:** Draft for review (revised after R1 spike)
**Date:** 2026-06-27
**Author:** Claude (with M. Gannouni)
**Builds on:** zero-install web-Studio recording (PR #161) and mobile quality hardening (PR #162).

## Overview

Today, recording a mobile scenario is "paste-the-flow": the app spawns `maestro studio --no-window` (web Studio on `http://localhost:9999`), opens it in the **external browser**, the PO records, clicks **Copy**, then **manually pastes** the YAML back into the app. This design removes the manual paste by **embedding the Studio in an app-owned window** and **reading the recorded flow straight from the clipboard** when the PO finishes.

The PO records as before and clicks **Copy** (a gesture they already make); the app then captures the flow from the OS clipboard automatically — no paste, no external browser.

## R1 spike — verified findings (the basis for this design)

Run live against the managed Maestro 2.5.1 + an Android emulator (real taps on the OUIGO staging app, watching network + clipboard):

1. **`POST /api/run-command {yaml, dryRun}`** fires for *every* command added (a `dryRun:true` preview then the real one). It is a reliable **live stream**, but it is **NOT edit-safe**: if the PO deletes or reorders commands in the panel, the run-command stream still contains the removed/old commands. So it is not a trustworthy source of the *final* flow.
2. **The "Copy" button makes NO network call.** It serialises the *current command panel* (edits included — the authoritative final state) and writes it to the **OS clipboard** as YAML:
   ```
   - tapOn:
       id: com.sncf.ouigo.next.staging:id/button_notice_footer_learn_more
   - tapOn: Bordeaux Saint-Jean
   ```
   Note: **commands only** — no `appId:` and no `---` header.
3. **The "Export" button** calls `POST /api/format-flow {commands:[…yaml…]}` → response `{config:"appId: null", commands:"<clean yaml>"}`. Authoritative, but `appId` is `null` (Studio doesn't know it) and it needs a click on Export specifically.

**Conclusion:** the robust, minimal capture is **reading the OS clipboard after Copy** — it reflects the authoritative edited panel, requires no fragile `fetch`/DOM interception, and Electron can read the same OS clipboard the browser Copy wrote to. The originally-planned preload `fetch`-interception is dropped.

## Goals

- Eliminate the manual paste step for mobile recording.
- Keep recording inside the app (embedded window, no external browser) — **decision: embedded window**.
- Robust: never regress below today's behaviour — manual paste stays as a guaranteed fallback.
- Stay pinned to managed Maestro **2.5.1**.

## Non-Goals

- No change to the **run** path, report mapping, or Firebase/app-install logic.
- No change to web (Playwright) recording. No iOS.
- No `fetch`/DOM interception, no in-page preload for capture.

## Architecture

Parallel change to the recorder, keeping `maestroRecorder.ts` **electron-free** (unit-test constraint). Electron-specific pieces (window, clipboard) live behind injected deps.

```
NewScenario (renderer) ── recording:start (mobile, deviceId) ──▶ maestroRecorder.startRecording (main, electron-free)
   ├─ ensureManagedMaestro → ensureAppOnDevice → spawn studio → waitForPort
   └─ deps.openStudio(url, { onClosed })          ← replaces deps.openExternal(url)
         ▼
      studioWindow.ts (NEW, electron) — BrowserWindow loads http://localhost:9999 (hardened),
        onClosed → cancel the recording

PO records in the embedded window, clicks "Copy" (Studio writes YAML to the OS clipboard)

NewScenario "Terminer l'enregistrement" ── recording:stop(recordingId) ──▶ maestroRecorder.stopRecording(recordingId, pastedFlow?)
   flow source, in priority order:
     1. pastedFlow (explicit manual fallback, if the PO used the paste box)
     2. deps.readClipboard()           ← Electron clipboard.readText(), injected
     3. → throw "Aucune étape détectée…" (same guard as today)
   then: normalizeFlow(raw, env.app.appId)  →  parseFlowSteps  →  saveScenario  →  close window
   returns { scenario, flowText }

NewScenario shows flowText READ-ONLY → "Lancer" → runScenario   (Decision 3: confirm before run)
```

### New / changed modules

- **`src/main/recorder/studioWindow.ts`** (NEW, imports electron; not unit-tested, injected). `openStudioWindow(url, { onClosed }): { close(): void }`. Creates a `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no `webSecurity` downgrade; loads only `http://localhost:9999` and blocks navigation elsewhere; `onClosed` on window `closed`.
- **`src/shared/flow.ts`** (CHANGED). Add **`normalizeFlow(raw: string, appId: string): string`** (pure, dependency-free — shared module stays yaml-lib-free): strips any leading `appId:` line and any header up to `---` from `raw`, takes the command body, and returns a valid `appId: <appId>\n---\n<body>`. This fixes the **latent bug** that `rebaseFlowAppId` prefixes an `appId:` but never inserts the required `---` separator — so a flow built from Copy/Export output (commands-only) was missing `---` and would be invalid for Maestro. `normalizeFlow` supersedes the ad-hoc rebase in the recorder for this path.
- **`src/main/recorder/maestroRecorder.ts`** (CHANGED). Replace `deps.openExternal` with `deps.openStudio`; add `deps.readClipboard` (default = Electron `clipboard.readText`, but the dep keeps the module electron-free and testable). `stopRecording(recordingId, pastedFlow?)`: resolve the flow source by the priority above; `normalizeFlow(raw, env.app.appId)`; require `parseFlowSteps(...).length > 0` (existing guard, validated **before** closing the window — consistent with PR #162 #8); save; close the window. `cancelRecording` closes the window. Stays electron-free.
- **`src/renderer/screens/NewScenario.tsx`** (CHANGED). Mobile branch: "Démarrer l'enregistrement" opens the embedded window; while recording show **"Terminer l'enregistrement"** + **"Annuler"** and a one-line hint ("Enregistre dans la fenêtre, clique **Copy**, puis **Terminer**."). On Terminer → `stopRecording` (no `pastedFlow`, so it reads the clipboard) → show the captured flow **read-only** → **"Lancer"** confirm. If the clipboard yields nothing parseable, reveal the **manual paste fallback** (today's textarea + Copy instructions) and let the PO paste, then "Créer le scénario".

## The three approved decisions

1. **Capture = OS clipboard after Copy** (replaces fetch-interception, per the R1 spike).
2. **Embedded `BrowserWindow`** for the Studio (in-app experience) — user's choice.
3. **Confirm before run** — show the captured flow read-only, require an explicit "Lancer" (consistent with the PR #162 retry affordance).
   Manual paste is retained as the guaranteed fallback.

## Data flow (happy path)

1. PO: NewScenario → Mobile → device → name → **Démarrer l'enregistrement**.
2. App ensures binary + app-on-device, spawns Studio, waits for port, opens the **embedded Studio window**.
3. PO records on the device mirror; clicks **Copy** in the Studio (YAML → OS clipboard).
4. PO clicks **Terminer l'enregistrement** → `stopRecording` reads the clipboard, `normalizeFlow` builds a valid `appId:\n---\n…` flow, validates ≥1 step, saves, closes the window.
5. App shows the captured flow read-only → **Lancer** → run + LiveRun.

## Error handling

| Situation | Behaviour |
|---|---|
| Studio doesn't start (port timeout) | existing French error, process killed (unchanged) |
| Window closed by PO mid-recording | treated as **cancel** (onClosed → cancelRecording); no scenario |
| Clipboard empty / not a flow at Terminer | reveal the manual paste fallback with instructions (no data loss) |
| App-on-device / Firebase failure at start | existing French error (unchanged) |
| App quit during recording | `before-quit` killAllRecordings (PR #162) also closes the Studio window |

## Security

- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no `webSecurity` downgrade; loads only `http://localhost:9999` (our own spawned local server) and refuses navigation elsewhere. No node/IPC surface exposed to the page (no capture preload needed).
- Clipboard is read in the **main** process via Electron `clipboard.readText()` only when the PO clicks Terminer.

## Testing strategy

- **`normalizeFlow`** (pure, in `src/shared/flow.ts`): unit-test — commands-only input → `appId: x\n---\n<body>`; input that already has `appId:`+`---` → appId rebased, single `---`, body preserved; input with `appId:` but no `---` (the latent-bug case) → valid `---` inserted; empty/whitespace → empty body (caller's `parseFlowSteps` guard rejects).
- **`maestroRecorder.stopRecording`**: unit-test flow-source priority (pasted > clipboard > throw) with injected `readClipboard` + `openStudio`; validation-before-close (no window close on empty, retry works); appId header correct; dedup id preserved; `cancelRecording`/`onClosed` closes the window.
- **`studioWindow.ts`**: not unit-tested (Electron); covered by the injected-deps seam + a manual live test with the repaired 2.5.1 binary via `OTL_MAESTRO_BIN`.
- **`NewScenario.tsx`**: render tests for the embedded-recording flow (Terminer → read-only flow → Lancer → run), the empty-clipboard → paste-fallback path, and that the happy-path behaviours are preserved.
- **CI**: biome lint + vitest + electron-vite build green on all three OS; no `import "electron"` in unit-tested main modules; `src/shared/flow.ts` stays dependency-free; no new npm deps.

## Risks

- **R-A — Clipboard contains unrelated content.** If the PO clicks Terminer without having clicked Copy, the clipboard holds whatever was there. **Mitigation:** `normalizeFlow` + `parseFlowSteps` must yield ≥1 plausible command; otherwise treat as "nothing captured" → reveal the paste fallback (no bad scenario saved).
- **R-B — Studio internal/UI changes.** Mitigated by pinning to managed 2.5.1; the clipboard format is the Studio's stable Copy output.
- **R-C — Embedded-window clipboard permissions.** Electron `BrowserWindow` allows the page's `navigator.clipboard.writeText` (Copy) and the main process reads the same OS clipboard; verified conceptually, to be confirmed in the live test.
- **R-D — Latent `---` bug.** Surfaced by the spike; fixed centrally by `normalizeFlow` (also benefits the existing paste path).

## Open questions for review

1. After capture, should "Lancer" be a separate confirm step (Decision 3, recommended) or should we keep today's immediate auto-run? (Recommended: confirm — the PO sees what was captured.)
2. Embedded window as a separate child window (recommended) vs. a maximised in-app modal? (Cosmetic; decide at implementation.)
