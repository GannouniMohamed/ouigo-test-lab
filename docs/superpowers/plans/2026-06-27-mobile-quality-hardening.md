# Mobile Feature Quality Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task is TDD (red→green→commit). Detailed per-finding problem + fix is in `.superpowers/sdd/findings.md` (git-ignored); each task brief in `.superpowers/sdd/task-N-brief.md`.

**Goal:** Fix the 43 confirmed findings from the adversarial review of the Maestro mobile feature (download/install robustness, recorder lifecycle, runner/report correctness, IPC robustness, renderer UX/discoverability).

**Architecture:** Surgical fixes within the existing parallel-Maestro-path architecture. No new dependencies. Behaviour-preserving except where a finding documents a bug.

**Tech Stack:** Electron + React + TypeScript, vitest, Biome. CI = `npm run lint` + `npm test` + `npm run build` (no tsc on tests).

## Global Constraints
- French UI copy for everything user-facing (errors, hints, labels).
- No `import "electron"` in unit-tested main modules (keeps vitest green).
- `OTL_MAESTRO_BIN` env seam has absolute priority in `maestroBin()` / `ensureManagedMaestro()` resolution — never break it.
- No new npm dependency.
- Every behaviour change is driven by a failing test first (TDD).
- Commit messages end with the two trailers (Co-Authored-By + Claude-Session) used in this repo.
- Each task must leave `npm run lint && npm test` green.

---

### Task 1: managedMaestro download & install robustness
**Covers findings:** 1, 2, 3, 4, 5, 6, 19, 20.
**Files:** `src/main/mobile/managedMaestro.ts`, `tests/main/managedMaestro.test.ts`.
**Core changes:**
1. **Fix `realDownload` dual-consumer bug:** remove the `src.on("data")` listener. Count bytes for progress with a counting `Transform` (or `PassThrough` with a `data` handler placed INSIDE the pipeline chain) so the stream has a single consumer. `pipeline(src, counter, createWriteStream(destPath))`.
2. **In-flight singleton lock:** module-level `let inflight: Promise<{bin:string}> | undefined`. `ensureManagedMaestro` returns the existing `inflight` if present; otherwise assigns `inflight = _doEnsure(deps).finally(() => { inflight = undefined })`. NOTE the `OTL_MAESTRO_BIN` short-circuit and the already-present-binary short-circuit must run BEFORE taking the lock (they must stay synchronous-fast and never serialise behind a download).
3. **Failure cleanup + self-heal:** wrap download+unzip in try/catch; on any failure remove the extraction dir (`maestro/` subdir) AND the zip before rethrowing. After a verified-good extraction (bin exists), write a sentinel file `<dir>/.maestro-ok`.
4. **Gate readiness on sentinel:** `managedMaestroBin()` returns the bin path only if BOTH the bin exists AND the sentinel exists (so a partial extraction no longer short-circuits forever). `isManagedMaestroReady` follows.
**Tests (write first):**
- realDownload byte-integrity: stub `globalThis.fetch` to return a `Response` whose body is a web stream emitting several known chunks (>64KB total); run realDownload to a temp file; assert the file bytes are byte-identical to the concatenated input and `onProgress` fired with the right total.
- concurrency: two parallel `ensureManagedMaestro()` calls with a slow injected `download`; assert `download` called exactly once and both resolve to the same bin.
- failure cleanup: injected `unzip` rejects on first call, succeeds on second; assert after the first failure the zip and `maestro/` dir are gone, and a second call re-downloads (download called twice).
- failure-path rejections: download throws → rejects; unzip throws → rejects; bin missing after unzip → rejects with the French "binaire introuvable" message.
- sentinel: after happy path, `.maestro-ok` exists and `isManagedMaestroReady()` is true; delete sentinel → `isManagedMaestroReady()` false even though bin file remains.

### Task 2: recorder lifecycle
**Covers findings:** 7, 8, 22, 38, 42.
**Files:** `src/main/recorder/maestroRecorder.ts`, `src/main/index.ts`, `tests/main/maestroRecorder.test.ts`.
**Core changes:**
1. **Validate before kill (#8):** in `stopRecording`, validate the pasted flow (`parseFlowSteps(raw).length > 0`) BEFORE `session.kill()` / `activeRecordings.delete()`. On validation failure throw WITHOUT killing or deleting the session, so the user can correct the paste and retry.
2. **Kill orphans on quit (#7):** export `killAllRecordings()` from maestroRecorder (iterate `activeRecordings`, call each `kill`, clear map). In `src/main/index.ts` add `app.on("before-quit", () => killAllRecordings())`. (index.ts already imports electron — allowed there; keep maestroRecorder electron-free.)
3. **French not-found message (#22):** replace `Recording not found: ${id}` with `Session d'enregistrement introuvable (${id}) — elle a peut-être déjà été arrêtée ou annulée.`
**Tests (write first / update):**
- update the existing "YAML vide → erreur" + "YAML sans commande → erreur" tests to also assert `kill` was NOT called and a subsequent valid `stopRecording(id, validYaml)` succeeds (retry works).
- the existing "crée le scénario…" test still asserts `kill` called once on success.
- not-found message assertion regex → `/introuvable/i` (was `/not found/i`).
- ensureAppOnDevice failure (#38): seed a `source:"firebase"` env, inject deps where `ensureMaestro` resolves but ensureAppOnDevice path returns `{ok:false, error:"Firebase: réseau coupé"}`; assert `startRecording` rejects with a message containing "Firebase". (Use the existing dep-injection seam; if ensureAppOnDevice isn't currently injectable, inject via the existing deps object — see how startRecording wires it.)
- dedup (#42): start+stop twice with name "Réservation"; assert the second scenario id is suffixed (e.g. `reservation-2`) and both exist in the store.

### Task 3: runner, report & firebase correctness
**Covers findings:** 9, 10, 23, 27, 11, 21, 26, 24, 25, 37, 40.
**Files:** `src/main/runner/maestroReportMapper.ts`, `src/main/mobile/ensureAppOnDevice.ts`, `src/main/mobile/doctor.ts`, `src/main/mobile/firebase.ts`, and tests `maestroReportMapper.test.ts`, `ensureAppOnDevice.test.ts`, `mobileDoctor.test.ts`, `firebase.test.ts`, `maestroRunner.test.ts`.
**Core changes (each TDD):**
1. `parseJUnitStatus` (#9): also treat `errors="N>0"` on `<testsuite>` as failed, even with no child `<error>` tag. Add a test with `errors="1"` and no child tag.
2. ensureAppOnDevice adb error (#10): error string = `(res.stderr.trim() || res.stdout.trim()) || \`adb a quitté (code ${res.code})\``. Add a stdout-only `INSTALL_FAILED_*` test.
3. doctor version (#23): import `MAESTRO_VERSION` and use it instead of the `"2.5.1"` literal.
4. firebase .aab regex (#27): `/\.aab(?:[?#]|$)/i`; add a `app.aab#sig` test.
**Tests-only additions (no source change unless a test reveals a bug):**
5. firebase getAccessToken failure (#11) + listReleases 4xx; 6. step-event sequence asserts in maestroRunner run-passant/échouant (#21, #26); 7. firebase displayVersion+buildVersion cache-key reuse (#24); 8. ensureAppOnDevice firebase-source-with-undefined-config guard (#25); 9. ensureManagedMaestro failure in maestroRunner.run → failed report (#37); 10. report persistence: getReport + scenario lastRun after run (#40).

### Task 4: IPC robustness
**Covers findings:** 12, 13, 28, 29, 39, 30.
**Files:** `src/main/recorder/playwrightRecorder.ts`, `src/main/ipc/recordingHandlers.ts`, `src/main/ipc/register.ts`, `src/preload/index.ts`, tests `recordingIpc.test.ts`/`recordingDispatch.test.ts`, `mobileIpc.test.ts`.
**Core changes (each TDD):**
1. playwright cancel (#12): add `cancelRecording(id)` to playwrightRecorder (kill child tree + delete from its activeRecordings, mirroring maestroRecorder); call it from `handleCancelRecording` when kind is web.
2. destroyed-sender guard (#13): in register.ts, wrap every `event.sender.send(...)` closure (prepare-progress at ~212, plus scenario run/runBatch progress) with `if (!event.sender.isDestroyed()) ...`.
3. preload deviceId type (#28): add `deviceId?: string` to preload `runScenario` opts type (type-only).
4. stop unknown-id guard (#29, #39): in `handleStopRecording`, if `kind === undefined` throw `new Error("Enregistrement introuvable ou déjà annulé.")` before delegating. Add a test calling `handleStopRecording("unknown")` asserting that French error.
5. prepare onProgress test (#30): test that `handlePrepareMaestro(progressSpy)` forwards progress; and that calling the progress closure after a destroyed mock sender does not throw.

### Task 5: renderer UX & discoverability
**Covers findings:** 14, 15, 16, 17, 18, 31, 32, 33, 34, 36, 41. (Defer #35 — general nav, out of scope.)
**Files:** `src/renderer/screens/NewScenario.tsx`, `src/renderer/screens/ProjectEnvironments.tsx`, `src/renderer/screens/MobileDoctor.tsx`, `src/renderer/screens/Projects.tsx`, `src/renderer/components/ProjectContextBar.tsx`, tests `newScenario.test.tsx`, `projectEnvironments.test.tsx`, `mobileDoctor.test.tsx`.
**Core changes (each TDD):**
1. Escape hatch (#14): when active env has no app, the NewScenario hint includes a button that `navigate(\`/projects/${activeProjectId}/environments\`)`; disabled Start button gets `title`/`aria-describedby` pointing at the hint. Projects.tsx "Environnements" button gets `aria-label`.
2. Empty appId (#16): ProjectEnvironments `save()` blocks (or shows inline error) when an enabled app has empty `appId`; field-level French hint.
3. Studio URL + format hint (#17): show clickable `http://localhost:9999` while recording; one-line format hint under the textarea; lightweight `pastedFlow.includes("appId:")` warning before submit.
4. Separate save from run (#18): keep `pastedFlow` and recordingId context until run success; on run failure show scenario name + retry path instead of a blank screen.
5. MobileDoctor onboarding (#15) + actionFor default (#34): contextual tip linking to Environnements; `actionFor` returns a sensible fallback for unknown keys; test the openExternal LINKS branch.
6. Context bar on /environments (#31): narrow the guard so `/projects/:id/environments` still shows the bar (keep it hidden on `/projects` and `/projects/new`).
7. aria-labels (#32, #33): env table inputs and the three Firebase inputs get aria-labels / field labels.
8. Test fixes (#36, #41): newScenario navigate assertion includes `steps: []`; mobileDoctor progress test fires the captured onMaestroProgress callback and asserts `50%` shows then clears.
