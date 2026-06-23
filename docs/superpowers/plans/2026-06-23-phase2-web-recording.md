# Ouigo Test Lab — Phase 2 (Enregistrement Web) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un utilisateur non technique d'enregistrer un parcours web (via Playwright codegen) sans écrire de code : le scénario généré apparaît dans la bibliothèque et est immédiatement exécutable par la Phase 1.

**Architecture:** Un `PlaywrightRecorder` côté main encapsule `playwright codegen` (spawn cross-platform, commande injectable via `OTL_CODEGEN` pour la testabilité). Il écrit le test généré dans un fichier puis crée un scénario (meta + spec) via le `scenarioStore` existant. Une nouvelle UI « Nouveau scénario » pilote start/stop. Le scénario produit réutilise tout le pipeline d'exécution Phase 1 (même modèle de données).

**Tech Stack:** Electron, React + TS, Playwright codegen (`@playwright/test`), Vitest, @testing-library/react.

## Global Constraints

- Node ≥ 20, TS strict. Renderer ne touche que `window.api` (jamais fs/child_process/playwright).
- Spawn cross-platform : réutiliser le motif du runner — `const isWindows = process.platform === "win32"; const cmd = process.env.OTL_CODEGEN ?? (isWindows ? "npx.cmd" : "npx");` avec `{ detached: !isWindows, shell: isWindows }`. Annulation : `taskkill /PID <pid> /T /F` (win) sinon `process.kill(-pid, "SIGKILL")`.
- Un scénario = `scenario.meta.json` + `<specFile>` sous `<workspace>/scenarios/<id>/` (modèle Phase 1, inchangé).
- Couleurs design : cyan `#00C9B1` → bleu `#2F6BFF`, échec `#FF3366`, monospace JetBrains Mono.
- Un commit par étape verte ; 1 ticket = 1 branche `feat/TK-xx` = 1 PR ; CI verte (macOS+Linux+Windows) avant merge.
- `OTL_WORKSPACE` pointe un dossier temporaire dans les tests ; cleanup via `Reflect.deleteProperty`.

## Modèle de fichiers

```
src/
├── main/
│   ├── recorder/
│   │   ├── playwrightRecorder.ts   # startRecording / stopRecording (spawn codegen + finalize)
│   │   └── slugify.ts              # nom -> id de scénario sûr (réutilisable)
│   └── ipc/
│       ├── handlers.ts             # (+ rien : recording est stateful → dans register.ts)
│       └── register.ts             # (+ ipc recording:start / recording:stop)
├── preload/index.ts                # (+ startRecording / stopRecording)
├── renderer/
│   ├── api.d.ts                    # (+ types recording)
│   └── screens/
│       └── NewScenario.tsx         # écran /scenarios/new (création + enregistrement)
tests/
├── fixtures/fake-codegen.mjs       # faux codegen pour tests (écrit un spec, attend le kill)
└── e2e/recording.spec.ts           # E2E: enregistrer (fake codegen) -> exécuter -> Réussi
```

---

### Task 1 (TK-P2-01) : slugify + PlaywrightRecorder

**Files:**
- Create: `src/main/recorder/slugify.ts`, `src/main/recorder/playwrightRecorder.ts`
- Create: `tests/fixtures/fake-codegen.mjs`
- Test: `tests/main/playwrightRecorder.test.ts`

**Interfaces:**
- Consumes: `scenarioStore.saveScenario`, `environmentStore.getEnvironment`, `getWorkspaceDir`, types `Scenario`, `Environment`.
- Produces:
  - `slugify(name: string): string` — minuscule, accents retirés, espaces→`-`, caractères non `[a-z0-9-]` retirés, fallback `"scenario"` si vide.
  - `playwrightRecorder` object:
    - `startRecording(opts: { name: string; browser: "chromium"|"firefox"|"webkit"; environmentId: string }): Promise<{ recordingId: string }>`
    - `stopRecording(recordingId: string): Promise<Scenario>`

- [ ] **Step 1: Write `tests/fixtures/fake-codegen.mjs`** — a fake codegen that parses its `-o <file>` arg, writes a valid Playwright spec there immediately, then stays alive until killed:
```js
#!/usr/bin/env node
// Fake `playwright codegen`: writes a spec to the -o path, then waits.
const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const out = oi >= 0 ? args[oi + 1] : null;
import("node:fs").then(({ writeFileSync }) => {
  if (out) {
    writeFileSync(
      out,
      'import { expect, test } from "@playwright/test";\n' +
      'test("parcours enregistré", async ({ page }) => {\n' +
      '  await page.goto(process.env.PLAYWRIGHT_BASE_URL);\n' +
      '  await expect(page.locator("h1")).toHaveText("Accueil");\n' +
      '});\n',
    );
  }
  setInterval(() => {}, 1000); // stay alive until killed by stopRecording
});
```

- [ ] **Step 2: Write the failing test** `tests/main/playwrightRecorder.test.ts`:
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRecorder } from "../../src/main/recorder/playwrightRecorder";
import { slugify } from "../../src/main/recorder/slugify";
import { listScenarios, getScenario } from "../../src/main/stores/scenarioStore";
import { saveEnvironment } from "../../src/main/stores/environmentStore";

const REPO = resolve(__dirname, "../..");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "otl-rec-"));
  process.env.OTL_WORKSPACE = dir;
  // point the recorder at the fake codegen instead of real `npx playwright codegen`
  process.env.OTL_CODEGEN = "node";
  process.env.OTL_CODEGEN_ARGS = resolve(REPO, "tests/fixtures/fake-codegen.mjs");
  saveEnvironment({ id: "local", label: "Local", baseURL: "https://x.example", variables: {} });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
  Reflect.deleteProperty(process.env, "OTL_CODEGEN");
  Reflect.deleteProperty(process.env, "OTL_CODEGEN_ARGS");
});

describe("slugify", () => {
  it("normalise le nom", () => {
    expect(slugify("Parcours de Connexion ")).toBe("parcours-de-connexion");
    expect(slugify("Achat billet Paris → Lyon")).toBe("achat-billet-paris-lyon");
    expect(slugify("")).toBe("scenario");
  });
});

describe("playwrightRecorder", () => {
  it("enregistre puis crée un scénario exécutable", async () => {
    const { recordingId } = await playwrightRecorder.startRecording({
      name: "Parcours enregistré", browser: "chromium", environmentId: "local",
    });
    expect(recordingId).toBeTruthy();
    // let the fake codegen write the file
    await new Promise((r) => setTimeout(r, 300));
    const scenario = await playwrightRecorder.stopRecording(recordingId);
    expect(scenario.name).toBe("Parcours enregistré");
    expect(scenario.platform).toBe("web");
    expect(listScenarios()).toHaveLength(1);
    // the generated spec was persisted
    expect(getScenario(scenario.id).specFile).toMatch(/\.spec\.ts$/);
  }, 15000);
});
```

- [ ] **Step 3: Run → must FAIL** (`npx vitest run tests/main/playwrightRecorder.test.ts`).

- [ ] **Step 4: Implement `slugify.ts`**:
```ts
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "scenario";
}
```

- [ ] **Step 5: Implement `playwrightRecorder.ts`**:
  - Module map `activeRecordings = new Map<string, { child: ChildProcess; outFile: string; name: string; browser; environmentId }>()`.
  - `startRecording(opts)`:
    - `const env = getEnvironment(opts.environmentId)`.
    - `const recordingId = randomUUID()`.
    - `const outFile = join(getWorkspaceDir(), "recordings", \`${recordingId}.spec.ts\`)`; ensure the dir exists.
    - Build the command: `const isWindows = process.platform === "win32"; const cmd = process.env.OTL_CODEGEN ?? (isWindows ? "npx.cmd" : "npx");`
    - Build args: if `process.env.OTL_CODEGEN` is set, args = `[process.env.OTL_CODEGEN_ARGS, env.baseURL, "--target", "playwright-test", "-o", outFile].filter(Boolean)`; else args = `["playwright", "codegen", env.baseURL, "--target", "playwright-test", "-o", outFile]`.
    - `spawn(cmd, args, { env: process.env, detached: !isWindows, shell: isWindows })`. Store in the map. Return `{ recordingId }`.
  - `stopRecording(recordingId)`:
    - Look up the session; if missing throw `Error(\`Recording not found: ${recordingId}\`)`.
    - Kill the codegen process tree (Windows: `spawn("taskkill", ["/PID", String(pid), "/T", "/F"])`; else `process.kill(-pid, "SIGKILL")` with `child.kill` fallback).
    - Wait briefly for the file to be flushed (poll up to ~2s for `existsSync(outFile)`).
    - `const specContent = readFileSync(outFile, "utf-8")`.
    - `const id = uniqueId(slugify(session.name))` — ensure uniqueness vs existing scenarios (append `-2`, `-3`… if `getScenario` would collide; catch the not-found to detect availability).
    - Build `Scenario { id, name: session.name, platform: "web", browser: session.browser, defaultEnvironmentId: session.environmentId, tags: [], specFile: \`${id}.spec.ts\`, createdAt: new Date().toISOString(), lastRun: { status: "never" } }`.
    - `saveScenario(scenario, specContent)`. Remove from the map. Return the scenario.

- [ ] **Step 6: Run → PASS**. `npm run lint` + `npm run build` → pass.

- [ ] **Step 7: Commit**: `git add -A && git commit -m "feat(TK-P2-01): PlaywrightRecorder + slugify"`

---

### Task 2 (TK-P2-02) : IPC enregistrement (window.api)

**Files:**
- Modify: `src/main/ipc/register.ts`, `src/preload/index.ts`, `src/renderer/api.d.ts`
- Test: `tests/main/recordingIpc.test.ts` (teste les fonctions de delegation, pas Electron)

**Interfaces:**
- Consumes: `playwrightRecorder`.
- Produces: `window.api.startRecording(opts): Promise<{ recordingId: string }>` and `window.api.stopRecording(recordingId): Promise<Scenario>`.

- [ ] **Step 1: Write the failing test** `tests/main/recordingIpc.test.ts` — import a small pure delegator `handleStartRecording`/`handleStopRecording` (add them to `register.ts` as exported functions OR a new `recordingHandlers.ts`) and assert they call the recorder. Prefer a new `src/main/ipc/recordingHandlers.ts` with:
```ts
import { playwrightRecorder } from "../recorder/playwrightRecorder";
export function handleStartRecording(opts) { return playwrightRecorder.startRecording(opts); }
export function handleStopRecording(id: string) { return playwrightRecorder.stopRecording(id); }
```
Test (with `OTL_CODEGEN` fake as in TK-P2-01) that start→stop yields a Scenario and persists it.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** `recordingHandlers.ts`; in `register.ts` add `ipcMain.handle("recording:start", (_e, opts) => handleStartRecording(opts))` and `ipcMain.handle("recording:stop", (_e, id) => handleStopRecording(id))`. In `preload/index.ts` add `startRecording(opts) { return ipcRenderer.invoke("recording:start", opts); }` and `stopRecording(id) { return ipcRenderer.invoke("recording:stop", id); }`. Extend `OtlApi` in `api.d.ts`.

- [ ] **Step 4: Run → PASS**. `npm run lint` + `npm run build` → pass.

- [ ] **Step 5: Commit**: `git add -A && git commit -m "feat(TK-P2-02): IPC enregistrement"`

---

### Task 3 (TK-P2-03) : Écran New Scenario + entrée « + Nouveau scénario »

**Files:**
- Create: `src/renderer/screens/NewScenario.tsx` (default export)
- Modify: `src/renderer/App.tsx` (route `/scenarios/new`), `src/renderer/screens/HubLibrary.tsx` (bouton « + Nouveau scénario »)
- Test: `tests/renderer/newScenario.test.tsx`

**Interfaces:**
- Consumes: `window.api.listEnvironments`, `window.api.startRecording`, `window.api.stopRecording`, `EnvPicker`, navigation.
- Produces: route `/scenarios/new`.

- [ ] **Step 1: Write the failing test** `tests/renderer/newScenario.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewScenario from "../../src/renderer/screens/NewScenario";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

beforeEach(() => {
  navigateMock.mockReset();
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  (globalThis as any).window.api = {
    listEnvironments: vi.fn().mockResolvedValue([{ id: "local", label: "Local", baseURL: "https://x", variables: {} }]),
    startRecording: vi.fn().mockResolvedValue({ recordingId: "rec-1" }),
    stopRecording: vi.fn().mockResolvedValue({ id: "parcours", name: "Parcours", platform: "web", browser: "chromium", defaultEnvironmentId: "local", tags: [], specFile: "parcours.spec.ts", createdAt: "", lastRun: { status: "never" } }),
  };
});
afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: cleanup
  Reflect.deleteProperty((globalThis as any).window, "api");
});

describe("NewScenario", () => {
  it("démarre puis arrête l'enregistrement et revient à la bibliothèque", async () => {
    render(<MemoryRouter><NewScenario /></MemoryRouter>);
    await userEvent.type(screen.getByPlaceholderText("Nom du scénario"), "Parcours");
    await userEvent.click(screen.getByRole("button", { name: /démarrer l'enregistrement/i }));
    await waitFor(() => expect(window.api.startRecording).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Parcours", environmentId: "local" }),
    ));
    await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
    await waitFor(() => {
      expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1");
      expect(navigateMock).toHaveBeenCalledWith("/scenarios");
    });
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** `NewScenario.tsx`:
  - State: `name`, `platform` (`"web"` selected, `"mobile"` disabled "bientôt"), `envId` (via `EnvPicker`, default first env), `recordingId | null`.
  - Fields: name `<input placeholder="Nom du scénario">`, platform selector (web active / mobile disabled), `<EnvPicker value={envId} onChange={setEnvId} />`.
  - Button "Démarrer l'enregistrement": disabled while name empty; on click `const { recordingId } = await window.api.startRecording({ name, browser: "chromium", environmentId: envId || "local" }); setRecordingId(recordingId)`.
  - When recording: show "Arrêter l'enregistrement" button → `const s = await window.api.stopRecording(recordingId); navigate("/scenarios")`.
  - Add route in `App.tsx`: `/scenarios/new` → `<NewScenario />`.
  - In `HubLibrary.tsx`: a "+ Nouveau scénario" button → `navigate("/scenarios/new")` (or a `<Link>`).

- [ ] **Step 4: Run → PASS**. Full `npm run test` → green. `npm run lint` + `npm run build` → pass.

- [ ] **Step 5: Commit**: `git add -A && git commit -m "feat(TK-P2-03): écran New Scenario + entrée création"`

---

### Task 4 (TK-P2-04) : E2E enregistrement → exécution

**Files:**
- Create: `tests/e2e/recording.spec.ts`

**Interfaces:**
- Consumes: l'app Electron + le fake codegen (`OTL_CODEGEN`).

- [ ] **Step 1: Write the E2E test** `tests/e2e/recording.spec.ts` — launch the app with `OTL_CODEGEN=node`, `OTL_CODEGEN_ARGS=<repo>/tests/fixtures/fake-codegen.mjs`, a fresh workspace, `OTL_FIXTURES` and `OTL_RUNNER_CONFIG` (as in happy-path). Steps: go to New Scenario (`+ Nouveau scénario`), type a name, Démarrer, wait, Arrêter → back on library with the new scenario → launch it → Report "Réussi".
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("enregistrement → scénario → exécution Réussi", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-rec-"));
  const app = await electron.launch({
    args: [join(REPO, "out/main/index.js")],
    env: {
      ...process.env,
      OTL_WORKSPACE: workspace,
      OTL_FIXTURES: join(REPO, "fixtures"),
      OTL_RUNNER_CONFIG: join(REPO, "playwright.runner.config.ts"),
      OTL_CODEGEN: "node",
      OTL_CODEGEN_ARGS: join(REPO, "tests/fixtures/fake-codegen.mjs"),
    },
  });
  try {
    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded");
    await win.getByRole("button", { name: /nouveau scénario/i }).click();
    await win.getByPlaceholder("Nom du scénario").fill("Mon parcours");
    await win.getByRole("button", { name: /démarrer l'enregistrement/i }).click();
    await win.getByRole("button", { name: /arrêter/i }).click();
    await expect(win.getByText("Mon parcours")).toBeVisible({ timeout: 15000 });
    await win.getByTestId("scenario-card-mon-parcours").getByRole("button", { name: /lancer/i }).click();
    await expect(win.getByText("Réussi", { exact: true })).toBeVisible({ timeout: 120000 });
  } finally {
    await app.close();
    rmSync(workspace, { recursive: true, force: true });
  }
});
```
> The recorded scenario's id is `slugify("Mon parcours")` = `mon-parcours`, so the card testid is `scenario-card-mon-parcours`. The fake-codegen spec navigates to `PLAYWRIGHT_BASE_URL` (the seeded `local` env's file:// site) and asserts the title → the run passes.

- [ ] **Step 2: Build + run `npm run test:e2e`** → all three E2E specs (happy, failure, recording) pass.
- [ ] **Step 3: `npm run lint` + `npm run build`** → pass.
- [ ] **Step 4: Commit**: `git add -A && git commit -m "test(TK-P2-04): e2e enregistrement → exécution"`

---

## Self-Review (couverture spec §6)

- Génération auto du flow sans écrire de YAML/code (§6.1) → TK-P2-01 (codegen écrit le spec), TK-P2-03 (UI). ✅
- Intégration codegen, start/stop (§6.2) → TK-P2-01. ✅
- Scénario généré immédiatement exécutable via Phase 1 (§6.2) → TK-P2-01 (même modèle) + TK-P2-04 (E2E prouve enregistrement→exécution). ✅
- Écran New Scenario : start → naviguer → stop → bibliothèque (§6.3) → TK-P2-03. ✅
- Non-objectif §6 (pas d'édition d'étapes, pas d'assertions IA) → respecté (aucune tâche). ✅
- Cross-platform (contrainte projet) → spawn codegen réutilise le motif Windows du runner. ✅

> **Pas de placeholder** : chaque tâche logique porte test + implémentation réels. L'enregistrement réel (GUI codegen) n'est pas testable en CI → on injecte un faux codegen via `OTL_CODEGEN`, ce qui teste tout le câblage (spawn, fichier généré, création de scénario, exécution) de façon déterministe.
