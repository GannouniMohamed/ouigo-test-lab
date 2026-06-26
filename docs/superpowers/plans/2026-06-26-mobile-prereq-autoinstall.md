# Auto-installation des prérequis mobiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Diagnostic mobile screen, each failing prerequisite shows an action button: a real one-click install for the Maestro CLI, and "open the install page" links for Maestro Studio / Java / adb, plus the existing emulator boot for the device row.

**Architecture:** Main process gains `installMaestroCli` (runs the official install script via the injectable `ToolRunner`) and a `~/.maestro/bin`-aware `maestroBin()` resolver so the post-install re-check passes without restarting the app. Two new IPC channels (`mobile:installMaestro`, `app:openExternal`) feed a per-row action model in the `MobileDoctor` renderer screen.

**Tech Stack:** Electron (main + preload + `shell.openExternal`), React + Vitest/Testing Library, Biome, Node `child_process` via existing `ToolRunner`.

## Global Constraints

- French UI copy, matching existing tone.
- CI gate = `npm run lint` (Biome) + `npm test` (Vitest) + `npm run build` (electron-vite) on macos/ubuntu/windows + E2E. No standalone `tsc` on tests in CI.
- Hermetic tests: inject `ToolRunner`/`exists` in main; stub `window.api` on `globalThis` in renderer. No network, no real install, in tests.
- Real CLI auto-install targets macOS/Linux (bash script). "Open page" buttons work on all OSes.
- Reuse existing patterns: `runTool`/`toolBin` (`src/main/mobile/exec.ts`), `ipcMain.handle` (`register.ts`), `MobileDoctor` row components, `.otl-*` classes.
- Exact URLs: CLI install `curl -fsSL https://get.maestro.mobile.dev | bash`; Studio `https://studio.maestro.dev`; Java `https://adoptium.net/temurin/releases/?version=17`; adb `https://developer.android.com/tools/releases/platform-tools`.

**Execution = 2 PRs:** PR 1 = back-end (Tasks 1–4). PR 2 = renderer (Task 5). Each: TDD, pre-PR adversarial review, CI green, auto-merge.

---

## Task 1: `maestroBin()` — resolve the Maestro binary, `~/.maestro/bin`-aware

**Files:**
- Modify: `src/main/mobile/exec.ts`
- Test: `tests/main/mobileExec.test.ts` (exists — extend)

**Interfaces:**
- Produces: `maestroBin(exists?: (p: string) => boolean): string` — returns `OTL_MAESTRO_BIN` if set, else `~/.maestro/bin/maestro` if it exists, else `"maestro"`.

- [ ] **Step 1: Write the failing test** — add to `tests/main/mobileExec.test.ts`:

```ts
import { maestroBin } from "../../src/main/mobile/exec";
import { join } from "node:path";
import { homedir } from "node:os";

describe("maestroBin", () => {
	afterEach(() => Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN"));

	it("préfère OTL_MAESTRO_BIN s'il est défini", () => {
		process.env.OTL_MAESTRO_BIN = "/custom/maestro";
		expect(maestroBin(() => true)).toBe("/custom/maestro");
	});

	it("retombe sur ~/.maestro/bin/maestro s'il existe", () => {
		const expected = join(homedir(), ".maestro", "bin", "maestro");
		expect(maestroBin((p) => p === expected)).toBe(expected);
	});

	it("retombe sur « maestro » (PATH) si rien d'autre", () => {
		expect(maestroBin(() => false)).toBe("maestro");
	});
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/main/mobileExec.test.ts` → FAIL (maestroBin not exported).

- [ ] **Step 3: Implement** in `src/main/mobile/exec.ts` (add imports `existsSync` from `node:fs`, `homedir` from `node:os`, `join` from `node:path`):

```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Résout le binaire maestro. Le script d'install le pose dans ~/.maestro/bin,
// hors du PATH du process Electron — on le retrouve donc explicitement pour que
// la re-vérification passe juste après une install, sans relancer l'app.
export function maestroBin(exists: (p: string) => boolean = existsSync): string {
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return override;
	const local = join(homedir(), ".maestro", "bin", "maestro");
	if (exists(local)) return local;
	return "maestro";
}
```

- [ ] **Step 4: Run, verify it passes** — `npx vitest run tests/main/mobileExec.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/exec.ts tests/main/mobileExec.test.ts
git commit -m "feat(mobile) — maestroBin(): résout ~/.maestro/bin après auto-install"
```

---

## Task 2: Use `maestroBin()` at the maestro call sites

**Files:**
- Modify: `src/main/mobile/doctor.ts:50` (`maestroOut`)
- Modify: `src/main/mobile/devices.ts:64` (`startDevice`)
- Modify: `src/main/runner/maestroRunner.ts:159` (`const bin = toolBin("maestro")`)
- Test: existing `tests/main/mobileDoctor.test.ts`, `tests/main/maestroRunner.test.ts`, `tests/main/mobileDevices.test.ts` must still pass; add one doctor case.

**Interfaces:**
- Consumes: `maestroBin` from Task 1.

- [ ] **Step 1: Write the failing test** — add to `tests/main/mobileDoctor.test.ts` a case asserting the maestro check uses the `~/.maestro/bin` path when present. Because `mobileDoctor` accepts `{ run, exists }`, drive it through `exists`:

```ts
it("résout maestro depuis ~/.maestro/bin quand présent", async () => {
	const localMaestro = require("node:path").join(
		require("node:os").homedir(), ".maestro", "bin", "maestro",
	);
	const calls: string[] = [];
	const run = async (bin: string, args: string[]) => {
		calls.push(bin);
		if (bin.endsWith("maestro") || bin === localMaestro)
			return { code: 0, stdout: "1.39.0", stderr: "" };
		if (bin === "java") return { code: 0, stdout: "", stderr: 'version "17"' };
		if (bin === "adb") return { code: 0, stdout: "Android Debug Bridge version 1.0.41", stderr: "" };
		return { code: 0, stdout: "", stderr: "" };
	};
	const report = await mobileDoctor({ run, exists: (p) => p === localMaestro });
	expect(calls).toContain(localMaestro);
	expect(report.maestro.ok).toBe(true);
});
```

NOTE: `mobileDoctor`'s `exists` is currently only used for Studio paths. Task 2 wires `maestroBin(exists)` into the maestro check so the same injected `exists` governs binary resolution.

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/main/mobileDoctor.test.ts` → FAIL (maestro still resolved via `toolBin`, `localMaestro` never called).

- [ ] **Step 3: Implement**
  - `doctor.ts`: replace `const maestroOut = await run(toolBin("maestro"), ["--version"]);` with `const maestroOut = await run(maestroBin(exists), ["--version"]);` and import `maestroBin` (drop `toolBin` only if unused — java/adb still use it, so keep both imports).
  - `devices.ts` `startDevice`: replace `toolBin("maestro")` with `maestroBin()`; import `maestroBin`.
  - `maestroRunner.ts:159`: replace `const bin = toolBin("maestro");` with `const bin = maestroBin();`; import `maestroBin` (keep `quoteArgForCmd`, `quoteForCmd`).

- [ ] **Step 4: Run, verify it passes** — `npx vitest run tests/main/mobileDoctor.test.ts tests/main/maestroRunner.test.ts tests/main/mobileDevices.test.ts` → PASS (existing tests use `OTL_MAESTRO_BIN`, which `maestroBin` honours first).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/doctor.ts src/main/mobile/devices.ts src/main/runner/maestroRunner.ts tests/main/mobileDoctor.test.ts
git commit -m "feat(mobile) — utilise maestroBin() au doctor/runner/startDevice"
```

---

## Task 3: `installMaestroCli` installer module

**Files:**
- Create: `src/main/mobile/installers.ts`
- Test: `tests/main/mobileInstallers.test.ts` (create)

**Interfaces:**
- Consumes: `ToolRunner` from `src/main/mobile/exec.ts`.
- Produces: `installMaestroCli(run?: ToolRunner): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing test** — `tests/main/mobileInstallers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { installMaestroCli } from "../../src/main/mobile/installers";

afterEach(() => Reflect.deleteProperty(process.env, "OTL_MAESTRO_INSTALL_CMD"));

describe("installMaestroCli", () => {
	it("exécute sh -c <commande d'install> et réussit sur code 0", async () => {
		const calls: Array<{ bin: string; args: string[] }> = [];
		const run = vi.fn(async (bin: string, args: string[]) => {
			calls.push({ bin, args });
			return { code: 0, stdout: "Maestro installed", stderr: "" };
		});
		const res = await installMaestroCli(run);
		expect(res).toEqual({ ok: true });
		expect(calls[0].bin).toBe("sh");
		expect(calls[0].args[0]).toBe("-c");
		expect(calls[0].args[1]).toContain("get.maestro.mobile.dev");
	});

	it("échoue avec l'erreur sur code non nul", async () => {
		const run = vi.fn(async () => ({ code: 1, stdout: "", stderr: "curl: (6) could not resolve host" }));
		const res = await installMaestroCli(run);
		expect(res.ok).toBe(false);
		expect(res.error).toContain("could not resolve host");
	});

	it("honore le seam OTL_MAESTRO_INSTALL_CMD (tests hermétiques)", async () => {
		process.env.OTL_MAESTRO_INSTALL_CMD = "true";
		const run = vi.fn(async (_bin: string, args: string[]) => ({ code: 0, stdout: args[1], stderr: "" }));
		await installMaestroCli(run);
		expect(run.mock.calls[0][1][1]).toBe("true");
	});
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/main/mobileInstallers.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/main/mobile/installers.ts`:

```ts
import { type ToolRunner, runTool } from "./exec";

const DEFAULT_INSTALL_CMD = "curl -fsSL https://get.maestro.mobile.dev | bash";

// Installe le Maestro CLI via le script officiel. Le seam OTL_MAESTRO_INSTALL_CMD
// permet des tests hermétiques (sans réseau). macOS/Linux (shell bash).
export async function installMaestroCli(
	run: ToolRunner = runTool,
): Promise<{ ok: boolean; error?: string }> {
	const cmd = process.env.OTL_MAESTRO_INSTALL_CMD || DEFAULT_INSTALL_CMD;
	const { code, stderr } = await run("sh", ["-c", cmd]);
	if (code === 0) return { ok: true };
	return {
		ok: false,
		error: stderr.trim() || `Échec de l'installation (code ${code}).`,
	};
}
```

- [ ] **Step 4: Run, verify it passes** — `npx vitest run tests/main/mobileInstallers.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/installers.ts tests/main/mobileInstallers.test.ts
git commit -m "feat(mobile) — installMaestroCli: auto-install du CLI via script (seam testable)"
```

---

## Task 4: IPC — `mobile:installMaestro` + `app:openExternal`

**Files:**
- Modify: `src/main/ipc/mobileHandlers.ts` (add `handleInstallMaestro`)
- Modify: `src/main/ipc/register.ts` (register both channels; import `shell` from electron)
- Modify: `src/preload/index.ts` (`installMaestro`, `openExternal`)
- Modify: `src/renderer/api.d.ts` (typings)
- Test: `tests/main/mobileIpc.test.ts` (exists — extend with `handleInstallMaestro`)

**Interfaces:**
- Consumes: `installMaestroCli` (Task 3).
- Produces: `handleInstallMaestro(): Promise<{ ok: boolean; error?: string }>`; renderer `window.api.installMaestro()` and `window.api.openExternal(url)`.

- [ ] **Step 1: Write the failing test** — add to `tests/main/mobileIpc.test.ts`:

```ts
import { handleInstallMaestro } from "../../src/main/ipc/mobileHandlers";

it("handleInstallMaestro délègue à installMaestroCli (seam → succès)", async () => {
	process.env.OTL_MAESTRO_INSTALL_CMD = "true"; // commande qui réussit
	const res = await handleInstallMaestro();
	expect(res.ok).toBe(true);
	Reflect.deleteProperty(process.env, "OTL_MAESTRO_INSTALL_CMD");
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run tests/main/mobileIpc.test.ts` → FAIL (handleInstallMaestro missing).

- [ ] **Step 3: Implement**
  - `mobileHandlers.ts`: add
    ```ts
    import { installMaestroCli } from "../mobile/installers";
    export function handleInstallMaestro(): Promise<{ ok: boolean; error?: string }> {
    	return installMaestroCli();
    }
    ```
  - `register.ts`: import `shell` (`import { BrowserWindow, ipcMain, shell } from "electron";`), import `handleInstallMaestro` from `./mobileHandlers`, and after the existing mobile channels (line ~200):
    ```ts
    ipcMain.handle("mobile:installMaestro", () => handleInstallMaestro());
    ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));
    ```
  - `preload/index.ts`: in the mobile block add
    ```ts
    installMaestro() {
    	return ipcRenderer.invoke("mobile:installMaestro");
    },
    openExternal(url: string) {
    	return ipcRenderer.invoke("app:openExternal", url);
    },
    ```
  - `renderer/api.d.ts`: add to `OtlApi`
    ```ts
    installMaestro(): Promise<{ ok: boolean; error?: string }>;
    openExternal(url: string): Promise<void>;
    ```

- [ ] **Step 4: Run, verify it passes** — `npx vitest run tests/main/mobileIpc.test.ts` → PASS. Then `npx vitest run && npx @biomejs/biome check . && npm run build`.

- [ ] **Step 5: Commit + open PR 1**

```bash
git add src/main/ipc/mobileHandlers.ts src/main/ipc/register.ts src/preload/index.ts src/renderer/api.d.ts tests/main/mobileIpc.test.ts
git commit -m "feat(mobile) — IPC mobile:installMaestro + app:openExternal (preload/typage)"
```

---

## Task 5: `MobileDoctor` — per-row action buttons (PR 2)

**Files:**
- Modify: `src/renderer/screens/MobileDoctor.tsx`
- Modify: `src/renderer/theme.css` (small additions)
- Test: `tests/renderer/mobileDoctor.test.tsx` (extend)

**Interfaces:**
- Consumes: `window.api.installMaestro`, `window.api.openExternal`, `window.api.startDevice`, `window.api.mobileDoctor` (existing).

Behavior: each failing check renders an action by key — `maestro` → "Installer" (calls `installMaestro`, shows "Installation…" while pending, then `refresh()`, shows short error on failure); `studio`/`java`/`adb` → a link button calling `openExternal(URL)`; `device` → "Démarrer un émulateur" (existing `bootEmulator`). A passing check shows no action.

- [ ] **Step 1: Write the failing tests** — add to `tests/renderer/mobileDoctor.test.tsx` (stub gains `installMaestro`, `openExternal`):

```ts
it("Maestro CLI en échec → bouton Installer lance installMaestro puis revérifie", async () => {
	const installMaestro = vi.fn().mockResolvedValue({ ok: true });
	const mobileDoctor = vi.fn()
		.mockResolvedValueOnce({ allOk: false, java: ok("Java 17+"), maestro: bad("Maestro CLI", "Installe…"), adb: ok("adb"), studio: ok("Maestro Studio"), device: ok("Appareil") })
		.mockResolvedValueOnce({ allOk: true, java: ok("Java 17+"), maestro: ok("Maestro CLI"), adb: ok("adb"), studio: ok("Maestro Studio"), device: ok("Appareil") });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = { mobileDoctor, startDevice: vi.fn(), installMaestro, openExternal: vi.fn() };
	render(<MemoryRouter><MobileDoctor /></MemoryRouter>);
	await screen.findByText("Maestro CLI");
	await userEvent.click(screen.getByRole("button", { name: /^installer$/i }));
	await waitFor(() => expect(installMaestro).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
});

it("install CLI échoue → message d'erreur affiché", async () => {
	const installMaestro = vi.fn().mockResolvedValue({ ok: false, error: "réseau indisponible" });
	const mobileDoctor = vi.fn().mockResolvedValue({ allOk: false, java: ok("Java 17+"), maestro: bad("Maestro CLI", "Installe…"), adb: ok("adb"), studio: ok("Maestro Studio"), device: ok("Appareil") });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = { mobileDoctor, startDevice: vi.fn(), installMaestro, openExternal: vi.fn() };
	render(<MemoryRouter><MobileDoctor /></MemoryRouter>);
	await screen.findByText("Maestro CLI");
	await userEvent.click(screen.getByRole("button", { name: /^installer$/i }));
	await waitFor(() => expect(screen.getByText(/réseau indisponible/i)).toBeInTheDocument());
});

it("Maestro Studio en échec → Ouvrir la page appelle openExternal(studio.maestro.dev)", async () => {
	const openExternal = vi.fn();
	const mobileDoctor = vi.fn().mockResolvedValue({ allOk: false, java: ok("Java 17+"), maestro: ok("Maestro CLI"), adb: ok("adb"), studio: bad("Maestro Studio", "Installe…"), device: ok("Appareil") });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = { mobileDoctor, startDevice: vi.fn(), installMaestro: vi.fn(), openExternal };
	render(<MemoryRouter><MobileDoctor /></MemoryRouter>);
	await screen.findByText("Maestro Studio");
	await userEvent.click(screen.getByRole("button", { name: /ouvrir la page/i }));
	expect(openExternal).toHaveBeenCalledWith("https://studio.maestro.dev");
});
```

NOTE: the existing two tests construct `window.api` with only `{ mobileDoctor, startDevice }`. Update that shared stub to also include `installMaestro: vi.fn()` and `openExternal: vi.fn()` so unrelated tests don't crash when a row renders an action.

- [ ] **Step 2: Run, verify they fail** — `npx vitest run tests/renderer/mobileDoctor.test.tsx` → FAIL (no per-row action buttons).

- [ ] **Step 3: Implement** in `MobileDoctor.tsx`:
  - Add an action descriptor per check key. Define a constant map for links:
    ```ts
    const LINKS: Record<string, string> = {
    	studio: "https://studio.maestro.dev",
    	java: "https://adoptium.net/temurin/releases/?version=17",
    	adb: "https://developer.android.com/tools/releases/platform-tools",
    };
    ```
  - Add state: `const [installing, setInstalling] = useState(false);` and `const [installError, setInstallError] = useState("");`.
  - `installCli`:
    ```ts
    async function installCli(): Promise<void> {
    	setInstalling(true);
    	setInstallError("");
    	try {
    		const res = await window.api.installMaestro();
    		if (!res?.ok) setInstallError(res?.error ?? "Échec de l'installation.");
    	} catch {
    		setInstallError("Échec de l'installation.");
    	} finally {
    		await refresh();
    		setInstalling(false);
    	}
    }
    ```
  - Pass `checkKey` + the action callbacks into `CheckRow` (or render the action inside the map over `CHECK_KEYS`). For a failing row:
    - `key === "maestro"`: `<button className="otl-tab" disabled={installing} onClick={installCli}>{installing ? "Installation…" : "Installer"}</button>` and, when `installError`, a `<p className="otl-doctor__hint otl-doctor__error">{installError}</p>`.
    - `key in LINKS`: `<button className="otl-tab" onClick={() => window.api.openExternal(LINKS[key])}>Ouvrir la page</button>`.
    - `key === "device"`: `<button className="otl-tab" disabled={loading} onClick={bootEmulator}>Démarrer un émulateur</button>` (reuse existing handler; if the screen lacks one, add the same `bootEmulator` as in NewScenario: `await startDevice(); await refresh();`).
  - Keep the global "Revérifier" button. The global "Démarrer un émulateur" button at the bottom is now redundant with the device-row action — remove it from the bottom bar.

- [ ] **Step 4: Run, verify they pass** — `npx vitest run tests/renderer/mobileDoctor.test.tsx` → PASS.

- [ ] **Step 5: CSS** — add to `theme.css`:

```css
.otl-doctor__action {
	margin-left: auto;
	align-self: center;
}
.otl-doctor__error {
	color: var(--otl-danger);
}
```
Wrap each row's right side so the action button sits at the end (`.otl-doctor__row` is already `display:flex`; put the button in a trailing element with `.otl-doctor__action`).

- [ ] **Step 6: Full gate + commit + open PR 2**

```bash
npx @biomejs/biome check --write src/renderer tests/renderer src/renderer/theme.css
npx vitest run && npx @biomejs/biome check . && npm run build
git add -A
git commit -m "feat(mobile) — Diagnostic: boutons d'action par ligne (Installer CLI, Ouvrir la page, émulateur)"
```

---

## Self-Review

- **Spec coverage:** per-row actions (T5), CLI auto-install (T3), `maestroBin` PATH fix (T1–T2), IPC installMaestro + openExternal (T4), Studio/Java/adb links (T5), device-row emulator (T5), spinner-simple feedback + short error (T5), tests (every task). All covered.
- **Placeholder scan:** no TBDs; every code step shows full code. The device-row `bootEmulator` reuse notes a fallback implementation inline.
- **Type consistency:** `installMaestroCli`/`handleInstallMaestro`/`window.api.installMaestro` all return `{ ok: boolean; error?: string }`. `maestroBin(exists?)` signature consistent across T1/T2. `openExternal(url)` consistent main↔preload↔renderer. `OTL_MAESTRO_INSTALL_CMD` seam consistent T3/T4.
