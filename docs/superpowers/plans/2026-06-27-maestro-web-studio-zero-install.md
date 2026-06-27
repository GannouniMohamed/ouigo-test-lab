# Maestro Web Studio « zéro-install » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au PO d'enregistrer un parcours mobile sans rien installer, via un Maestro 2.5.1 géré par l'app (Studio web `localhost:9999`) et un import du parcours par collage.

**Architecture:** Trois phases indépendamment livrables (1 PR par phase). Phase A : l'app télécharge/met en cache un binaire Maestro 2.5.1 et `maestroBin()` le résout partout. Phase B : le recorder lance le Studio web + ouvre le navigateur, et `stopRecording` importe le YAML collé. Phase C : le Diagnostic reflète « Maestro géré par l'app » et le code Studio desktop est retiré.

**Tech Stack:** Electron + React + TypeScript, electron-vite, Vitest (jsdom pour le renderer), Biome (lint). Node 20.

## Global Constraints

- **Copie UI en français** (libellés, messages d'erreur, hints).
- **TDD** : test qui échoue d'abord, puis implémentation minimale.
- **Aucune dépendance npm nouvelle** (download via `fetch` natif Node 20, extraction via `unzip`/`tar` du système).
- **Pas d'`import "electron"` dans le code testé en unitaire** (main recorder/managedMaestro/doctor) — utiliser `spawn` OS ou l'injection de dépendances.
- **CI gate** : `npm run lint` (Biome) + `npm test` (Vitest) + `npm run build` doivent passer sur macos/ubuntu/windows.
- **Seam de binaire** : `OTL_MAESTRO_BIN` court-circuite toujours la résolution et le téléchargement (priorité absolue).
- **Version Maestro épinglée** : `2.5.1`, zip `https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.5.1/maestro.zip`.
- **Le binaire géré s'extrait en** `maestro/bin/maestro` (`maestro.bat` sous Windows) sous `<workspace>/tools/maestro-2.5.1/`.
- **Commits** : finir chaque message par les deux lignes :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY
  ```

---

## File Structure

**Phase A**
- Create `src/main/mobile/managedMaestro.ts` — télécharge/cache/résout le binaire Maestro 2.5.1.
- Modify `src/main/mobile/exec.ts` — `maestroBin()` préfère le binaire géré.
- Modify `src/main/runner/maestroRunner.ts` — garantit le binaire géré avant de lancer un run.
- Test `tests/main/managedMaestro.test.ts`, additions à `tests/main/mobileExec.test.ts`.

**Phase B**
- Modify `src/main/recorder/maestroRecorder.ts` — Studio web + stop par YAML collé + `cancelRecording`.
- Modify `src/main/ipc/recordingHandlers.ts` — propage `pastedFlow`, ajoute `handleCancelRecording`.
- Modify `src/main/ipc/register.ts` — canaux `recording:stop` (2 args) + `recording:cancel`.
- Modify `src/preload/index.ts`, `src/renderer/api.d.ts` — `stopRecording(id, pastedFlow?)`, `cancelRecording(id)`.
- Modify `src/renderer/screens/NewScenario.tsx` — zone de collage + boutons « Créer le scénario » / « Annuler ».
- Tests : réécriture `tests/main/maestroRecorder.test.ts`, MAJ `tests/main/recordingDispatch.test.ts`, MAJ `tests/renderer/newScenario.test.tsx`.

**Phase C**
- Modify `src/main/mobile/doctor.ts` — check « Maestro (géré par l'app) », suppression du check Studio desktop.
- Modify `src/shared/types.ts` — retrait du champ `studio` de `MobileDoctorReport`.
- Modify `src/main/ipc/mobileHandlers.ts` — `handlePrepareMaestro` remplace `handleInstallMaestro`.
- Modify `src/main/ipc/register.ts`, `src/preload/index.ts`, `src/renderer/api.d.ts` — canal `mobile:prepareMaestro` + progression.
- Modify `src/renderer/screens/MobileDoctor.tsx` — bouton « Préparer » + suppression de la ligne Studio.
- Delete `src/main/mobile/installers.ts`, `tests/main/mobileInstallers.test.ts`.
- Tests : MAJ `tests/main/mobileDoctor.test.ts`, `tests/main/mobileIpc.test.ts`, `tests/renderer/mobileDoctor.test.tsx`.

---

# PHASE A — Maestro géré par l'app (PR 1)

## Task A1: `managedMaestro.ts` — download / cache / résolution

**Files:**
- Create: `src/main/mobile/managedMaestro.ts`
- Test: `tests/main/managedMaestro.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceDir()` from `src/main/workspace.ts` (returns string; throws if no `OTL_WORKSPACE` and electron absent).
- Produces:
  - `MAESTRO_VERSION = "2.5.1"`, `MAESTRO_ZIP_URL: string`
  - `managedMaestroDir(): string`
  - `managedMaestroBin(exists?: (p: string) => boolean): string | undefined`
  - `isManagedMaestroReady(exists?: (p: string) => boolean): boolean`
  - `interface EnsureManagedDeps { download?; unzip?; exists?; chmod?; onProgress? }`
  - `ensureManagedMaestro(deps?: EnsureManagedDeps): Promise<{ bin: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/main/managedMaestro.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureManagedMaestro,
	isManagedMaestroReady,
	managedMaestroBin,
	managedMaestroDir,
} from "../../src/main/mobile/managedMaestro";

let dir: string;
const isWindows = process.platform === "win32";
function binPath(ws: string): string {
	return join(
		ws,
		"tools",
		"maestro-2.5.1",
		"maestro",
		"bin",
		isWindows ? "maestro.bat" : "maestro",
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mm-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_MAESTRO_BIN"])
		Reflect.deleteProperty(process.env, k);
});

describe("managedMaestroBin / isManagedMaestroReady", () => {
	it("undefined / false quand le binaire est absent", () => {
		expect(managedMaestroBin(() => false)).toBeUndefined();
		expect(isManagedMaestroReady(() => false)).toBe(false);
	});
	it("renvoie le chemin attendu quand il existe", () => {
		const expected = binPath(dir);
		expect(managedMaestroBin((p) => p === expected)).toBe(expected);
		expect(isManagedMaestroReady((p) => p === expected)).toBe(true);
	});
});

describe("ensureManagedMaestro", () => {
	it("OTL_MAESTRO_BIN court-circuite tout (pas de téléchargement)", async () => {
		process.env.OTL_MAESTRO_BIN = "/opt/x/maestro";
		const download = vi.fn();
		const res = await ensureManagedMaestro({ download });
		expect(res.bin).toBe("/opt/x/maestro");
		expect(download).not.toHaveBeenCalled();
	});

	it("binaire déjà présent → pas de téléchargement", async () => {
		const expected = binPath(dir);
		const download = vi.fn();
		const res = await ensureManagedMaestro({
			exists: (p) => p === expected,
			download,
		});
		expect(res.bin).toBe(expected);
		expect(download).not.toHaveBeenCalled();
	});

	it("absent → download puis unzip puis chmod, dans cet ordre", async () => {
		let extracted = false;
		const calls: string[] = [];
		const expected = binPath(dir);
		const download = vi.fn(async () => {
			calls.push("download");
		});
		const unzip = vi.fn(async () => {
			calls.push("unzip");
			extracted = true;
		});
		const chmod = vi.fn(() => {
			calls.push("chmod");
		});
		const res = await ensureManagedMaestro({
			exists: (p) => extracted && p === expected,
			download,
			unzip,
			chmod,
		});
		expect(res.bin).toBe(expected);
		expect(download).toHaveBeenCalledWith(
			expect.stringContaining("cli-2.5.1"),
			join(managedMaestroDir(), "maestro.zip"),
			undefined,
		);
		expect(unzip).toHaveBeenCalledWith(
			join(managedMaestroDir(), "maestro.zip"),
			managedMaestroDir(),
		);
		expect(calls.slice(0, 2)).toEqual(["download", "unzip"]);
	});

	it("transmet onProgress au téléchargement", async () => {
		let extracted = false;
		const expected = binPath(dir);
		const onProgress = vi.fn();
		const download = vi.fn(
			async (
				_url: string,
				_dest: string,
				cb?: (r: number, t: number) => void,
			) => {
				cb?.(50, 100);
			},
		);
		await ensureManagedMaestro({
			exists: (p) => extracted && p === expected,
			download,
			unzip: async () => {
				extracted = true;
			},
			chmod: () => {},
			onProgress,
		});
		expect(onProgress).toHaveBeenCalledWith(50, 100);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/managedMaestro.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/mobile/managedMaestro'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/mobile/managedMaestro.ts`:

```ts
import { spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getWorkspaceDir } from "../workspace";

export const MAESTRO_VERSION = "2.5.1";
export const MAESTRO_ZIP_URL =
	"https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.5.1/maestro.zip";
const isWindows = process.platform === "win32";

// Dossier de cache du binaire géré, sous le workspace de l'app.
export function managedMaestroDir(): string {
	return join(getWorkspaceDir(), "tools", `maestro-${MAESTRO_VERSION}`);
}

// Chemin du binaire après extraction (le zip s'extrait en maestro/bin/maestro).
// Renvoie undefined si absent — et si le workspace est indisponible (tests
// unitaires sans OTL_WORKSPACE ni electron), on renvoie undefined sans planter.
export function managedMaestroBin(
	exists: (p: string) => boolean = existsSync,
): string | undefined {
	let dir: string;
	try {
		dir = managedMaestroDir();
	} catch {
		return undefined;
	}
	const bin = join(dir, "maestro", "bin", isWindows ? "maestro.bat" : "maestro");
	return exists(bin) ? bin : undefined;
}

export function isManagedMaestroReady(
	exists: (p: string) => boolean = existsSync,
): boolean {
	return managedMaestroBin(exists) !== undefined;
}

export interface EnsureManagedDeps {
	download?: (
		url: string,
		destPath: string,
		onProgress?: (received: number, total: number) => void,
	) => Promise<void>;
	unzip?: (zipPath: string, destDir: string) => Promise<void>;
	exists?: (p: string) => boolean;
	chmod?: (p: string, mode: number) => void;
	onProgress?: (received: number, total: number) => void;
}

// Télécharge en streaming via fetch natif (Node 20). Non couvert en unitaire
// (injecté par les tests) — exécuté uniquement en production.
async function realDownload(
	url: string,
	destPath: string,
	onProgress?: (received: number, total: number) => void,
): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body)
		throw new Error(`Téléchargement échoué (HTTP ${res.status}).`);
	const total = Number(res.headers.get("content-length") ?? 0);
	let received = 0;
	const src = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
	src.on("data", (chunk: Buffer) => {
		received += chunk.length;
		onProgress?.(received, total);
	});
	await pipeline(src, createWriteStream(destPath));
}

// Extrait le .zip via l'outil système : unzip (macOS/Linux), tar/bsdtar
// (Windows 10+). Non couvert en unitaire.
function realUnzip(zipPath: string, destDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const [cmd, cmdArgs] = isWindows
			? (["tar", ["-xf", zipPath, "-C", destDir]] as const)
			: (["unzip", ["-o", "-q", zipPath, "-d", destDir]] as const);
		const child = spawn(cmd, [...cmdArgs]);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`Extraction échouée (code ${code}).`)),
		);
	});
}

export async function ensureManagedMaestro(
	deps: EnsureManagedDeps = {},
): Promise<{ bin: string }> {
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return { bin: override };

	const exists = deps.exists ?? existsSync;
	const existing = managedMaestroBin(exists);
	if (existing) return { bin: existing };

	const download = deps.download ?? realDownload;
	const unzip = deps.unzip ?? realUnzip;
	const chmod = deps.chmod ?? chmodSync;

	const dir = managedMaestroDir();
	mkdirSync(dir, { recursive: true });
	const zipPath = join(dir, "maestro.zip");
	await download(MAESTRO_ZIP_URL, zipPath, deps.onProgress);
	await unzip(zipPath, dir);
	try {
		rmSync(zipPath, { force: true });
	} catch {
		/* nettoyage best-effort */
	}

	const bin = join(dir, "maestro", "bin", isWindows ? "maestro.bat" : "maestro");
	if (!isWindows) chmod(bin, 0o755);
	if (!exists(bin))
		throw new Error(
			"Maestro téléchargé mais binaire introuvable après extraction.",
		);
	return { bin };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/managedMaestro.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors on `managedMaestro.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/main/mobile/managedMaestro.ts tests/main/managedMaestro.test.ts
git commit -m "feat(mobile) — binaire Maestro 2.5.1 géré par l'app (download/cache)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

---

## Task A2: `maestroBin()` préfère le binaire géré ; le runner le garantit

**Files:**
- Modify: `src/main/mobile/exec.ts:76-84`
- Modify: `src/main/runner/maestroRunner.ts:159` (et imports en tête)
- Test: additions à `tests/main/mobileExec.test.ts`

**Interfaces:**
- Consumes: `managedMaestroBin`, `ensureManagedMaestro` from `managedMaestro.ts` (Task A1).
- Produces: `maestroBin()` résout `OTL_MAESTRO_BIN → managé → ~/.maestro → "maestro"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/main/mobileExec.test.ts` — extend the import line and append a new describe block.

Replace the import block at the top:

```ts
import { homedir, tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
```

Append at the end of the file:

```ts
describe("maestroBin — binaire géré par l'app", () => {
	afterEach(() => {
		Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});

	it("préfère le binaire géré au PATH quand il existe", () => {
		const ws = mkdtempSync(join(tmpdir(), "otl-mbin-"));
		process.env.OTL_WORKSPACE = ws;
		const managed = join(
			ws,
			"tools",
			"maestro-2.5.1",
			"maestro",
			"bin",
			process.platform === "win32" ? "maestro.bat" : "maestro",
		);
		expect(maestroBin((p) => p === managed)).toBe(managed);
	});

	it("OTL_MAESTRO_BIN reste prioritaire sur le binaire géré", () => {
		process.env.OTL_WORKSPACE = mkdtempSync(join(tmpdir(), "otl-mbin-"));
		process.env.OTL_MAESTRO_BIN = "/custom/maestro";
		expect(maestroBin(() => true)).toBe("/custom/maestro");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/mobileExec.test.ts`
Expected: FAIL — « préfère le binaire géré » renvoie `"maestro"` (la résolution ne connaît pas encore le binaire géré).

- [ ] **Step 3: Modify `exec.ts`**

Add the import after the existing imports (top of file):

```ts
import { managedMaestroBin } from "./managedMaestro";
```

Replace the body of `maestroBin` (lines 76-84) with:

```ts
export function maestroBin(
	exists: (p: string) => boolean = existsSync,
): string {
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return override;
	const managed = managedMaestroBin(exists);
	if (managed) return managed;
	const local = join(homedir(), ".maestro", "bin", "maestro");
	if (exists(local)) return local;
	return "maestro";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/mobileExec.test.ts`
Expected: PASS (including the 3 pre-existing `maestroBin` tests — the `~/.maestro` and PATH fallbacks still hold because `managedMaestroBin` returns `undefined` when `OTL_WORKSPACE` is unset).

- [ ] **Step 5: Make the runner guarantee the managed binary**

In `src/main/runner/maestroRunner.ts`, add to the imports near line 16:

```ts
import { ensureManagedMaestro } from "../mobile/managedMaestro";
```

Then, immediately after the `ensureAppOnDevice` guard (after line 132, before building `scenarioDir`), insert:

```ts
		// Garantit le binaire Maestro géré (no-op si déjà présent ou si
		// OTL_MAESTRO_BIN est défini en test). Échec → rapport d'échec mappé.
		try {
			await ensureManagedMaestro();
		} catch (err) {
			return guard(
				err instanceof Error
					? err.message
					: "Maestro indisponible — réessaie depuis le Diagnostic mobile.",
			);
		}
```

- [ ] **Step 6: Run the runner tests**

Run: `npx vitest run tests/main/maestroRunner.test.ts`
Expected: PASS (the suite sets `OTL_MAESTRO_BIN`, so `ensureManagedMaestro()` returns instantly without downloading).

- [ ] **Step 7: Full suite + lint**

Run: `npx vitest run && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/main/mobile/exec.ts src/main/runner/maestroRunner.ts tests/main/mobileExec.test.ts
git commit -m "feat(mobile) — maestroBin() préfère le binaire géré ; le runner le garantit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

**End of PR 1.** Open the PR for Phase A, watch CI to green, merge.

---

# PHASE B — Studio web + import par collage (PR 2)

## Task B1: Recorder — Studio web, stop par YAML collé, cancel

**Files:**
- Modify: `src/main/recorder/maestroRecorder.ts` (full rewrite of the module body)
- Test: rewrite `tests/main/maestroRecorder.test.ts`

**Interfaces:**
- Consumes: `ensureManagedMaestro` (A1), `ensureAppOnDevice`, `getEnvironment`, `getScenario`, `saveScenario`, `parseFlowSteps`, `rebaseFlowAppId`, `slugify`.
- Produces:
  - `maestroRecorder.startRecording(opts, deps?): Promise<{ recordingId: string }>` where
    `opts = { name; environmentId; projectId; tunnelId; deviceId? }` and
    `deps = { ensureMaestro?: () => Promise<{ bin: string }>; spawnStudio?: (bin: string, deviceId: string) => StudioHandle; waitForPort?: (url: string, timeoutMs: number) => Promise<void>; openExternal?: (url: string) => void }`
  - `maestroRecorder.stopRecording(recordingId: string, pastedFlow?: string): Promise<Scenario>`
  - `maestroRecorder.cancelRecording(recordingId: string): void`
  - `interface StudioHandle { pid?: number; kill: () => void }`
- Env seam: `OTL_SKIP_STUDIO_LAUNCH=1` skips spawn/wait/open entirely (still returns a `recordingId`).

- [ ] **Step 1: Write the failing test (rewrite the file)**

Replace the entire contents of `tests/main/maestroRecorder.test.ts` with:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maestroRecorder } from "../../src/main/recorder/maestroRecorder";
import * as projectStore from "../../src/main/stores/projectStore";
import { getScenario } from "../../src/main/stores/scenarioStore";
import type { Project } from "../../src/shared/types";

let dir: string;

function seedProject(): void {
	const project: Project = {
		id: "p1",
		name: "P",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" },
			},
		],
	};
	projectStore.saveProject(project);
}

// Dépendances injectées : Studio « lancé » sans process réel.
function fakeDeps() {
	const kill = vi.fn();
	return {
		kill,
		deps: {
			ensureMaestro: vi.fn(async () => ({ bin: "/fake/maestro" })),
			spawnStudio: vi.fn(() => ({ pid: 4242, kill })),
			waitForPort: vi.fn(async () => {}),
			openExternal: vi.fn(),
		},
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrec-"));
	process.env.OTL_WORKSPACE = dir;
	seedProject();
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("maestroRecorder.startRecording", () => {
	it("lance Studio web (ensure + spawn + attente port + ouverture navigateur)", async () => {
		const { deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "Mon parcours",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		expect(recordingId).toBeTruthy();
		expect(deps.ensureMaestro).toHaveBeenCalledTimes(1);
		expect(deps.spawnStudio).toHaveBeenCalledWith(
			"/fake/maestro",
			"emulator-5554",
		);
		expect(deps.waitForPort).toHaveBeenCalledWith(
			"http://localhost:9999",
			expect.any(Number),
		);
		expect(deps.openExternal).toHaveBeenCalledWith("http://localhost:9999");
	});

	it("sans deviceId → erreur", async () => {
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
			}),
		).rejects.toThrow(/appareil/i);
	});

	it("env sans app mobile → erreur", async () => {
		projectStore.saveProject({
			id: "p2",
			name: "P2",
			description: "",
			createdAt: "2026-06-26T00:00:00Z",
			environments: [{ id: "e", label: "E", baseURL: "", variables: {} }],
		});
		await expect(
			maestroRecorder.startRecording({
				name: "x",
				environmentId: "e",
				projectId: "p2",
				tunnelId: "general",
				deviceId: "emulator-5554",
			}),
		).rejects.toThrow(/application/i);
	});

	it("Studio ne démarre pas (timeout port) → erreur claire + process tué", async () => {
		const { kill, deps } = fakeDeps();
		deps.waitForPort = vi.fn(async () => {
			throw new Error("timeout");
		});
		await expect(
			maestroRecorder.startRecording(
				{
					name: "x",
					environmentId: "preprod",
					projectId: "p1",
					tunnelId: "general",
					deviceId: "emulator-5554",
				},
				deps,
			),
		).rejects.toThrow(/Studio n'a pas démarré/i);
		expect(kill).toHaveBeenCalledTimes(1);
	});
});

describe("maestroRecorder.stopRecording", () => {
	async function start() {
		const { kill, deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "Réservation",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		return { recordingId, kill };
	}

	it("crée le scénario depuis le YAML collé, rebase l'appId, stoppe Studio", async () => {
		const { recordingId, kill } = await start();
		const pasted =
			'appId: com.autre.enregistre\n---\n- launchApp\n- tapOn: "Réserver"\n';
		const scenario = await maestroRecorder.stopRecording(recordingId, pasted);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile).toBe(`${scenario.id}.flow.yaml`);
		expect(scenario.recordedStepCount).toBe(2);
		expect(kill).toHaveBeenCalledTimes(1);

		const saved = getScenario("p1", "general", scenario.id);
		expect(saved.name).toBe("Réservation");
		const spec = readFileSync(
			join(
				dir,
				"projects",
				"p1",
				"tunnels",
				"general",
				"scenarios",
				scenario.id,
				scenario.specFile,
			),
			"utf-8",
		);
		expect(spec).toContain("appId: com.ouigo.app");
		expect(spec).not.toContain("com.autre.enregistre");
	});

	it("YAML vide → erreur, pas de scénario", async () => {
		const { recordingId } = await start();
		await expect(
			maestroRecorder.stopRecording(recordingId, "   "),
		).rejects.toThrow(/étape/i);
	});

	it("YAML sans commande → erreur", async () => {
		const { recordingId } = await start();
		await expect(
			maestroRecorder.stopRecording(
				recordingId,
				"appId: com.x\n---\n# rien\n",
			),
		).rejects.toThrow(/étape/i);
	});

	it("recordingId inconnu → erreur", async () => {
		await expect(
			maestroRecorder.stopRecording("nope", "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/not found/i);
	});
});

describe("maestroRecorder.cancelRecording", () => {
	it("stoppe Studio sans créer de scénario", async () => {
		const { kill, deps } = fakeDeps();
		const { recordingId } = await maestroRecorder.startRecording(
			{
				name: "X",
				environmentId: "preprod",
				projectId: "p1",
				tunnelId: "general",
				deviceId: "emulator-5554",
			},
			deps,
		);
		maestroRecorder.cancelRecording(recordingId);
		expect(kill).toHaveBeenCalledTimes(1);
		// stop après cancel → recording introuvable
		await expect(
			maestroRecorder.stopRecording(recordingId, "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/not found/i);
	});

	it("recordingId inconnu → no-op", () => {
		expect(() => maestroRecorder.cancelRecording("nope")).not.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/maestroRecorder.test.ts`
Expected: FAIL — the old API doesn't accept `deps.spawnStudio`/`pastedFlow`/`cancelRecording`.

- [ ] **Step 3: Rewrite `maestroRecorder.ts`**

Replace the entire contents of `src/main/recorder/maestroRecorder.ts` with:

```ts
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type { Scenario } from "../../shared/types";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { ensureManagedMaestro } from "../mobile/managedMaestro";
import { getEnvironment } from "../stores/projectStore";
import { getScenario, saveScenario } from "../stores/scenarioStore";
import { slugify } from "./slugify";

const STUDIO_URL = "http://localhost:9999";
const STUDIO_TIMEOUT_MS = 30_000;
const isWindows = process.platform === "win32";

export interface StudioHandle {
	pid?: number;
	kill: () => void;
}

interface RecordingSession {
	name: string;
	projectId: string;
	tunnelId: string;
	environmentId: string;
	appId: string;
	kill: () => void;
}

const activeRecordings = new Map<string, RecordingSession>();

// Tue l'arbre de process Studio (JVM/driver). detached:!isWindows → kill par
// groupe ; Windows → taskkill /T. Même esprit que maestroRunner.cancel().
function killProc(child: ChildProcess): void {
	const pid = child.pid;
	if (pid === undefined) return;
	if (isWindows) spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
	else {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			try {
				child.kill("SIGKILL");
			} catch {
				/* déjà mort */
			}
		}
	}
}

// Lance le serveur Studio web (long-running). Le flag --device cible l'appareil.
function defaultSpawnStudio(bin: string, deviceId: string): StudioHandle {
	const child = spawn(bin, ["--device", deviceId, "studio", "--no-window"], {
		detached: !isWindows,
	});
	return { pid: child.pid, kill: () => killProc(child) };
}

// Attend que le serveur Studio réponde sur le port (toute réponse = prêt).
async function defaultWaitForPort(
	url: string,
	timeoutMs: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	throw new Error("timeout");
}

// Ouvre l'URL dans le navigateur système (pas d'import electron → testable).
function defaultOpenExternal(url: string): void {
	if (process.platform === "darwin") spawn("open", [url], { detached: true });
	else if (isWindows)
		spawn("cmd", ["/c", "start", "", url], { shell: true });
	else spawn("xdg-open", [url], { detached: true });
}

function uniqueId(projectId: string, tunnelId: string, base: string): string {
	let candidate = base;
	let n = 2;
	while (true) {
		try {
			getScenario(projectId, tunnelId, candidate);
			candidate = `${base}-${n++}`;
		} catch {
			return candidate;
		}
	}
}

export const maestroRecorder = {
	async startRecording(
		opts: {
			name: string;
			environmentId: string;
			projectId: string;
			tunnelId: string;
			deviceId?: string;
		},
		deps?: {
			ensureMaestro?: () => Promise<{ bin: string }>;
			spawnStudio?: (bin: string, deviceId: string) => StudioHandle;
			waitForPort?: (url: string, timeoutMs: number) => Promise<void>;
			openExternal?: (url: string) => void;
		},
	): Promise<{ recordingId: string }> {
		const env = getEnvironment(opts.projectId, opts.environmentId);
		if (!env.app?.appId)
			throw new Error(
				"Aucune application mobile configurée pour cet environnement.",
			);
		if (!opts.deviceId)
			throw new Error(
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.",
			);

		// Garantit le binaire Maestro géré (télécharge la 1re fois).
		const ensure = deps?.ensureMaestro ?? ensureManagedMaestro;
		const { bin } = await ensure();

		// L'app doit être présente sur l'appareil pour que Studio l'inspecte.
		const prep = await ensureAppOnDevice(env, opts.deviceId);
		if (!prep.ok) throw new Error(prep.error);

		const recordingId = randomUUID();
		let kill: () => void = () => {};

		// OTL_SKIP_STUDIO_LAUNCH court-circuite le lancement réel (dispatch/CI).
		if (process.env.OTL_SKIP_STUDIO_LAUNCH !== "1") {
			const spawnStudio = deps?.spawnStudio ?? defaultSpawnStudio;
			const waitForPort = deps?.waitForPort ?? defaultWaitForPort;
			const openExternal = deps?.openExternal ?? defaultOpenExternal;
			const handle = spawnStudio(bin, opts.deviceId);
			kill = handle.kill;
			try {
				await waitForPort(STUDIO_URL, STUDIO_TIMEOUT_MS);
			} catch {
				handle.kill();
				throw new Error(
					"Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie.",
				);
			}
			openExternal(STUDIO_URL);
		}

		activeRecordings.set(recordingId, {
			name: opts.name,
			projectId: opts.projectId,
			tunnelId: opts.tunnelId,
			environmentId: opts.environmentId,
			appId: env.app.appId,
			kill,
		});
		return { recordingId };
	},

	async stopRecording(
		recordingId: string,
		pastedFlow?: string,
	): Promise<Scenario> {
		const session = activeRecordings.get(recordingId);
		if (!session) throw new Error(`Recording not found: ${recordingId}`);

		session.kill(); // stoppe le serveur Studio

		const raw = (pastedFlow ?? "").trim();
		if (!raw || parseFlowSteps(raw).length === 0) {
			activeRecordings.delete(recordingId);
			throw new Error(
				"Aucune étape détectée — colle bien le parcours copié depuis Maestro Studio.",
			);
		}

		const flow = rebaseFlowAppId(raw, session.appId);
		const steps = parseFlowSteps(flow);

		const id = uniqueId(
			session.projectId,
			session.tunnelId,
			slugify(session.name),
		);
		const scenario: Scenario = {
			id,
			projectId: session.projectId,
			tunnelId: session.tunnelId,
			name: session.name,
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: session.environmentId,
			tags: [],
			specFile: `${id}.flow.yaml`,
			createdAt: new Date().toISOString(),
			recordedStepCount: steps.length,
			lastRun: { status: "never" },
		};
		saveScenario(scenario, flow);
		activeRecordings.delete(recordingId);
		return scenario;
	},

	cancelRecording(recordingId: string): void {
		const session = activeRecordings.get(recordingId);
		if (!session) return;
		session.kill();
		activeRecordings.delete(recordingId);
	},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/maestroRecorder.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/recorder/maestroRecorder.ts tests/main/maestroRecorder.test.ts
git commit -m "feat(mobile) — enregistrement via Studio web + import du parcours collé

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

---

## Task B2: IPC / preload / api.d.ts — `stopRecording(id, pastedFlow)` + `cancelRecording`

**Files:**
- Modify: `src/main/ipc/recordingHandlers.ts`
- Modify: `src/main/ipc/register.ts:196-197`
- Modify: `src/preload/index.ts:208-210`
- Modify: `src/renderer/api.d.ts:111`
- Test: update `tests/main/recordingDispatch.test.ts`

**Interfaces:**
- Consumes: `maestroRecorder.stopRecording(id, pastedFlow?)`, `maestroRecorder.cancelRecording(id)` (B1).
- Produces: `handleStopRecording(recordingId, pastedFlow?)`, `handleCancelRecording(recordingId)`; IPC channels `recording:stop` (id, pastedFlow), `recording:cancel` (id); preload `stopRecording(id, pastedFlow?)`, `cancelRecording(id)`.

- [ ] **Step 1: Update the dispatch test (failing)**

In `tests/main/recordingDispatch.test.ts`:

1. Add `OTL_MAESTRO_BIN` to `beforeEach` (so `ensureManagedMaestro` short-circuits) — after line 19 (`process.env.OTL_SKIP_STUDIO_LAUNCH = "1";`) add:

```ts
	process.env.OTL_MAESTRO_BIN = process.execPath;
```

2. Add `"OTL_MAESTRO_BIN"` to the cleanup array in `afterEach`.

3. Import `handleCancelRecording`:

```ts
import {
	handleCancelRecording,
	handleStartRecording,
	handleStopRecording,
} from "../../src/main/ipc/recordingHandlers";
```

4. Replace the mobile test body (lines 64-79) with the paste-based flow:

```ts
	it("platform mobile → maestroRecorder (crée un scénario mobile depuis le YAML collé)", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Parcours",
			browser: "chromium",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			platform: "mobile",
			deviceId: "emulator-5554",
		});
		const scenario = await handleStopRecording(
			recordingId,
			"appId: x\n---\n- launchApp\n",
		);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile.endsWith(".flow.yaml")).toBe(true);
	});

	it("cancel mobile → libère le recordingId (stop ensuite échoue)", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Annulé",
			browser: "chromium",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			platform: "mobile",
			deviceId: "emulator-5554",
		});
		handleCancelRecording(recordingId);
		await expect(
			handleStopRecording(recordingId, "appId: x\n---\n- launchApp\n"),
		).rejects.toThrow(/not found/i);
	});
```

Remove the now-unused `writeFileSync` import if Biome flags it (the web test no longer needs it — verify: the web test at the bottom doesn't use it, so delete `writeFileSync` from the `node:fs` import, keeping `mkdtempSync, rmSync`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/recordingDispatch.test.ts`
Expected: FAIL — `handleCancelRecording` not exported; `handleStopRecording` ignores the 2nd arg.

- [ ] **Step 3: Update `recordingHandlers.ts`**

Replace `handleStopRecording` and add `handleCancelRecording`:

```ts
export async function handleStopRecording(
	recordingId: string,
	pastedFlow?: string,
): Promise<Scenario> {
	const kind = recorderByRecording.get(recordingId);
	recorderByRecording.delete(recordingId);
	return kind === "mobile"
		? maestroRecorder.stopRecording(recordingId, pastedFlow)
		: playwrightRecorder.stopRecording(recordingId);
}

export function handleCancelRecording(recordingId: string): void {
	const kind = recorderByRecording.get(recordingId);
	recorderByRecording.delete(recordingId);
	// Seul le chemin mobile a un serveur Studio à stopper ; web = no-op.
	if (kind === "mobile") maestroRecorder.cancelRecording(recordingId);
}
```

- [ ] **Step 4: Update `register.ts`**

Replace line 197 and add a cancel channel. Also import `handleCancelRecording`:

```ts
import {
	handleCancelRecording,
	handleStartRecording,
	handleStopRecording,
} from "./recordingHandlers";
```

```ts
	ipcMain.handle("recording:start", (_e, opts) => handleStartRecording(opts));
	ipcMain.handle("recording:stop", (_e, id: string, pastedFlow?: string) =>
		handleStopRecording(id, pastedFlow),
	);
	ipcMain.handle("recording:cancel", (_e, id: string) =>
		handleCancelRecording(id),
	);
```

- [ ] **Step 5: Update `preload/index.ts`**

Replace `stopRecording` and add `cancelRecording`:

```ts
		stopRecording(recordingId: string, pastedFlow?: string) {
			return ipcRenderer.invoke("recording:stop", recordingId, pastedFlow);
		},
		cancelRecording(recordingId: string) {
			return ipcRenderer.invoke("recording:cancel", recordingId);
		},
```

- [ ] **Step 6: Update `api.d.ts`**

Replace line 111:

```ts
	stopRecording(recordingId: string, pastedFlow?: string): Promise<Scenario>;
	cancelRecording(recordingId: string): Promise<void>;
```

- [ ] **Step 7: Run tests + typecheck via build**

Run: `npx vitest run tests/main/recordingDispatch.test.ts && npm run build`
Expected: tests PASS; build succeeds (types consistent).

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/recordingHandlers.ts src/main/ipc/register.ts src/preload/index.ts src/renderer/api.d.ts tests/main/recordingDispatch.test.ts
git commit -m "feat(mobile) — IPC: stopRecording(pastedFlow) + cancelRecording

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

---

## Task B3: NewScenario — zone de collage + boutons « Créer le scénario » / « Annuler »

**Files:**
- Modify: `src/renderer/screens/NewScenario.tsx`
- Test: update `tests/renderer/newScenario.test.tsx`

**Interfaces:**
- Consumes: `window.api.startRecording`, `window.api.stopRecording(id, pastedFlow?)`, `window.api.cancelRecording(id)`, `window.api.runScenario`.
- Produces: rendered mobile recording UI with a `<textarea aria-label="Parcours enregistré">`, a « Créer le scénario » button, and an « Annuler » button.

- [ ] **Step 1: Write the failing test**

Add to `tests/renderer/newScenario.test.tsx` a focused test for the mobile paste flow. Append inside the existing top-level `describe` (match the file's existing `window.api` stubbing pattern — read the file first to reuse its `setApi`/render helpers). The test, using the file's established helpers:

```ts
	it("mobile : après démarrage, colle le parcours puis crée le scénario", async () => {
		// Arrange: env mobile + un appareil démarré (réutilise les stubs du fichier).
		const stop = vi.fn().mockResolvedValue({
			id: "resa",
			projectId: "p1",
			tunnelId: "general",
			name: "Resa",
			platform: "mobile",
			defaultEnvironmentId: "preprod",
			specFile: "resa.flow.yaml",
		});
		const run = vi.fn().mockResolvedValue({ runId: "r1", steps: [] });
		setApi({
			startRecording: vi.fn().mockResolvedValue({ recordingId: "rec1" }),
			stopRecording: stop,
			runScenario: run,
			listDevices: vi
				.fn()
				.mockResolvedValue([
					{ id: "emulator-5554", name: "Pixel", state: "booted" },
				]),
			listEnvironments: vi.fn().mockResolvedValue([
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "",
					variables: {},
					app: { appId: "com.ouigo.app", source: "installed" },
				},
			]),
		});

		renderNewScenario();
		// sélectionne Mobile + nomme
		await userEvent.click(await screen.findByText("Mobile"));
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Resa",
		);
		await userEvent.click(
			await screen.findByRole("button", { name: /Démarrer l'enregistrement/i }),
		);

		// colle le parcours
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "appId: x\n---\n- launchApp\n");
		await userEvent.click(
			screen.getByRole("button", { name: /Créer le scénario/i }),
		);

		await waitFor(() =>
			expect(stop).toHaveBeenCalledWith("rec1", "appId: x\n---\n- launchApp\n"),
		);
		expect(run).toHaveBeenCalled();
	});
```

> Implementer note: if the existing test file uses different helper names (e.g. a local `renderScreen` or inline `render(<NewScenario/>)` with a router wrapper, and a custom `setApi`), adapt the calls to match — read `tests/renderer/newScenario.test.tsx` first and mirror its conventions. The assertions (`findByLabelText("Parcours enregistré")`, `stopRecording` called with `(id, pasted)`) must stay as written.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/newScenario.test.tsx`
Expected: FAIL — no element labelled "Parcours enregistré".

- [ ] **Step 3: Add paste state**

In `src/renderer/screens/NewScenario.tsx`, add a state near the other recording states (after line 34 `const [recError, setRecError] = useState("");`):

```ts
	const [pastedFlow, setPastedFlow] = useState("");
```

- [ ] **Step 4: Update `handleStop` to pass the pasted flow (mobile)**

Replace the `stopRecording` call inside `handleStop` (line 162):

```ts
			const scenario = await window.api.stopRecording(
				recordingId,
				isMobile ? pastedFlow : undefined,
			);
```

And reset the textarea after success — add after `setRecordingId(null);` (line 164):

```ts
			setPastedFlow("");
```

- [ ] **Step 5: Add `handleCancel`**

Add this function after `handleStop` (after line 201):

```ts
	async function handleCancel() {
		if (!recordingId) return;
		try {
			await window.api.cancelRecording(recordingId);
		} catch {
			/* annulation best-effort */
		}
		setRecordingId(null);
		setPastedFlow("");
		setRecError("");
	}
```

- [ ] **Step 6: Render the mobile paste UI**

Replace the recording block (the `{!recordingId ? (...) : (...)}` at lines 506-532) with a version that branches on `isMobile` while recording:

```tsx
					{!recordingId ? (
						<button
							type="button"
							className="otl-btn-primary otl-method__btn"
							disabled={!name.trim() || !mobileReady || starting}
							onClick={handleStart}
						>
							{starting ? "Démarrage…" : "Démarrer l'enregistrement"}
						</button>
					) : isMobile ? (
						<div className="otl-method__recording">
							<div className="otl-recording-indicator">
								<span className="otl-recording-indicator__dot" />
								Studio ouvert dans le navigateur — enregistre ton parcours,
								clique « Copy », puis colle-le ci-dessous.
							</div>
							<textarea
								className="otl-input otl-method__paste"
								aria-label="Parcours enregistré"
								placeholder="Colle ici le parcours copié depuis Maestro Studio…"
								value={pastedFlow}
								onChange={(e) => setPastedFlow(e.target.value)}
								rows={8}
							/>
							<div className="otl-method__rec-actions">
								<button
									type="button"
									className="otl-btn-primary otl-method__btn"
									disabled={!pastedFlow.trim() || stopping}
									onClick={handleStop}
								>
									{stopping ? "Création…" : "Créer le scénario"}
								</button>
								<button
									type="button"
									className="otl-tab"
									disabled={stopping}
									onClick={handleCancel}
								>
									Annuler
								</button>
							</div>
						</div>
					) : (
						<div className="otl-method__recording">
							<div className="otl-recording-indicator">
								<span className="otl-recording-indicator__dot" />
								Enregistrement en cours…
							</div>
							<button
								type="button"
								className="otl-btn-stop otl-method__btn"
								disabled={stopping}
								onClick={handleStop}
							>
								{stopping ? "Arrêt…" : "Arrêter l'enregistrement"}
							</button>
						</div>
					)}
```

Also update the mobile method description (line 499-501) to mention the browser + Copy:

```tsx
									? "Maestro Studio s'ouvre dans ton navigateur : enregistre ton parcours, clique « Copy », puis colle-le ici."
```

- [ ] **Step 7: Add CSS for the paste area**

In `src/renderer/theme.css`, append:

```css
.otl-method__paste {
	width: 100%;
	min-height: 9rem;
	font-family: var(--otl-mono, monospace);
	resize: vertical;
}
.otl-method__rec-actions {
	display: flex;
	gap: 0.75rem;
	align-items: center;
	margin-top: 0.75rem;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/renderer/newScenario.test.tsx`
Expected: PASS. If other tests in the file referenced the old mobile recording label ("Enregistrement dans Maestro Studio…"), update those assertions to the new copy.

- [ ] **Step 9: Full suite + lint + build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/screens/NewScenario.tsx src/renderer/theme.css tests/renderer/newScenario.test.tsx
git commit -m "feat(mobile) — NewScenario: zone de collage du parcours + annulation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

**End of PR 2.** Open the PR for Phase B, watch CI to green, merge.

---

# PHASE C — Diagnostic simplifié + nettoyage (PR 3)

## Task C1: Doctor — check « Maestro (géré par l'app) », suppression du Studio desktop

**Files:**
- Modify: `src/shared/types.ts:73-80`
- Modify: `src/main/mobile/doctor.ts`
- Test: update `tests/main/mobileDoctor.test.ts`

**Interfaces:**
- Consumes: `isManagedMaestroReady(exists)` (A1).
- Produces: `MobileDoctorReport` without the `studio` field; `mobileDoctor()` maestro check labelled « Maestro (géré par l'app) ».

- [ ] **Step 1: Update the type (drop `studio`)**

In `src/shared/types.ts`, replace the `MobileDoctorReport` interface:

```ts
export interface MobileDoctorReport {
	allOk: boolean;
	java: DoctorCheck;
	maestro: DoctorCheck;
	adb: DoctorCheck;
	device: DoctorCheck; // au moins un appareil/émulateur joignable
}
```

- [ ] **Step 2: Update the doctor test (failing)**

In `tests/main/mobileDoctor.test.ts`:
- Remove the two `report.studio.ok` assertions (lines ~72 and ~116).
- The maestro check now depends on `isManagedMaestroReady`, not a `maestro --version` run. The suite injects `deps.exists`; add `OTL_WORKSPACE` so `managedMaestroDir()` resolves. In the test's setup, set `process.env.OTL_WORKSPACE` to a tmp dir (and clean up). For the "all OK" case make `exists` return `true` for a path containing `maestro-2.5.1`; for the "maestro KO" case make `exists` return `false`.

Concretely, add a helper and adjust the two scenarios. Read the file first; then ensure the "tout OK" case passes:

```ts
		const report = await mobileDoctor({
			run,
			exists: (p) => p.includes("maestro-2.5.1"),
		});
		expect(report.maestro.ok).toBe(true);
		expect(report.maestro.version).toBe("2.5.1");
		expect(report.allOk).toBe(true);
```

and the "maestro absent" case:

```ts
		const report = await mobileDoctor({ run, exists: () => false });
		expect(report.maestro.ok).toBe(false);
		expect(report.allOk).toBe(false);
```

Ensure `OTL_WORKSPACE` is set in `beforeEach` (tmp dir) and deleted in `afterEach` so `managedMaestroDir()` works. If the suite already sets it, reuse it.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/main/mobileDoctor.test.ts`
Expected: FAIL — `report.studio` removed from type and the maestro check still shells out.

- [ ] **Step 4: Rewrite the relevant parts of `doctor.ts`**

Edit `src/main/mobile/doctor.ts`:

1. Replace the imports line 4:

```ts
import { type ToolRunner, runTool, toolBin } from "./exec";
import { isManagedMaestroReady } from "./managedMaestro";
```

2. Delete `studioPaths()` (lines 33-42) and `studioInstalled()` (lines 44-49).

3. Replace the Maestro CLI block (lines 71-84) with:

```ts
	// Maestro est géré par l'app (binaire 2.5.1 téléchargé et mis en cache).
	const maestroReady = isManagedMaestroReady(exists);
	const maestro: DoctorCheck = {
		label: "Maestro (géré par l'app)",
		ok: maestroReady,
		version: maestroReady ? "2.5.1" : undefined,
		hint: maestroReady
			? undefined
			: "L'app téléchargera Maestro automatiquement au premier enregistrement, ou clique « Préparer ».",
	};
```

4. Delete the Studio block (lines 99-107).

5. Replace the final `allOk`/return (lines 122-123):

```ts
	const allOk = java.ok && maestro.ok && adb.ok && device.ok;
	return { allOk, java, maestro, adb, device };
```

> `parseMaestroVersion` stays exported (it is still referenced by its own unit tests and is harmless). `maestroBin` is no longer imported here.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/mobileDoctor.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/mobile/doctor.ts tests/main/mobileDoctor.test.ts
git commit -m "feat(mobile) — Diagnostic: « Maestro géré par l'app », sans Studio desktop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

---

## Task C2: IPC — `prepareMaestro` (+ progression) remplace `installMaestro` ; suppression des installers

**Files:**
- Modify: `src/main/ipc/mobileHandlers.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/api.d.ts`
- Delete: `src/main/mobile/installers.ts`, `tests/main/mobileInstallers.test.ts`
- Test: update `tests/main/mobileIpc.test.ts`

**Interfaces:**
- Consumes: `ensureManagedMaestro({ onProgress })` (A1).
- Produces: `handlePrepareMaestro(onProgress?): Promise<{ ok: boolean; error?: string }>`; IPC `mobile:prepareMaestro` (streams progress on `maestro:prepare-progress`); preload `prepareMaestro()` + `onMaestroProgress(cb)`.

- [ ] **Step 1: Update the IPC test (failing)**

In `tests/main/mobileIpc.test.ts`, replace the `handleInstallMaestro` test (around line 39) with a `handlePrepareMaestro` test. Read the file for its import/mock style; the new test:

```ts
	it("handlePrepareMaestro délègue à ensureManagedMaestro (seam → succès)", async () => {
		process.env.OTL_MAESTRO_BIN = process.execPath; // court-circuite le download
		const { handlePrepareMaestro } = await import(
			"../../src/main/ipc/mobileHandlers"
		);
		const res = await handlePrepareMaestro();
		expect(res.ok).toBe(true);
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});
```

Update the import at the top of the test file: replace `handleInstallMaestro` with `handlePrepareMaestro` (or use the dynamic import shown above).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/mobileIpc.test.ts`
Expected: FAIL — `handlePrepareMaestro` not exported.

- [ ] **Step 3: Update `mobileHandlers.ts`**

Replace the `installMaestroCli` import (line 5) and `handleInstallMaestro` (lines 20-25):

```ts
import { ensureManagedMaestro } from "../mobile/managedMaestro";
```

```ts
// Prépare (télécharge si besoin) le binaire Maestro géré. onProgress relaie la
// progression du téléchargement au renderer. Ne lève jamais.
export async function handlePrepareMaestro(
	onProgress?: (received: number, total: number) => void,
): Promise<{ ok: boolean; error?: string }> {
	try {
		await ensureManagedMaestro({ onProgress });
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
```

- [ ] **Step 4: Update `register.ts`**

In the imports from `./mobileHandlers`, replace `handleInstallMaestro` with `handlePrepareMaestro`. Replace the `mobile:installMaestro` handler (line 203) with:

```ts
	ipcMain.handle("mobile:prepareMaestro", (event) =>
		handlePrepareMaestro((received, total) =>
			event.sender.send("maestro:prepare-progress", { received, total }),
		),
	);
```

- [ ] **Step 5: Update `preload/index.ts`**

Replace the `installMaestro` method (lines 41-43) with:

```ts
		prepareMaestro() {
			return ipcRenderer.invoke("mobile:prepareMaestro");
		},
		onMaestroProgress(
			cb: (p: { received: number; total: number }) => void,
		) {
			const listener = (
				_e: Electron.IpcRendererEvent,
				payload: { received: number; total: number },
			) => cb(payload);
			ipcRenderer.on("maestro:prepare-progress", listener);
			return () =>
				ipcRenderer.removeListener("maestro:prepare-progress", listener);
		},
```

- [ ] **Step 6: Update `api.d.ts`**

Replace the `installMaestro` line (line 31) with:

```ts
	prepareMaestro(): Promise<{ ok: boolean; error?: string }>;
	onMaestroProgress(
		cb: (p: { received: number; total: number }) => void,
	): () => void;
```

- [ ] **Step 7: Delete the obsolete installer + its test**

```bash
git rm src/main/mobile/installers.ts tests/main/mobileInstallers.test.ts
```

- [ ] **Step 8: Run tests + build**

Run: `npx vitest run tests/main/mobileIpc.test.ts && npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/mobileHandlers.ts src/main/ipc/register.ts src/preload/index.ts src/renderer/api.d.ts tests/main/mobileIpc.test.ts
git commit -m "feat(mobile) — IPC: prepareMaestro (+ progression) remplace installMaestro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

---

## Task C3: MobileDoctor — bouton « Préparer » + progression, suppression de la ligne Studio

**Files:**
- Modify: `src/renderer/screens/MobileDoctor.tsx`
- Test: update `tests/renderer/mobileDoctor.test.tsx`

**Interfaces:**
- Consumes: `window.api.prepareMaestro()`, `window.api.onMaestroProgress(cb)`, `window.api.mobileDoctor()`.
- Produces: maestro row action « Préparer » with progress text; no Studio row; no `studioDownloadUrl` export.

- [ ] **Step 1: Update the renderer test (failing)**

In `tests/renderer/mobileDoctor.test.tsx`:
- Remove the `studioDownloadUrl` import and its `describe` block (lines ~175-185).
- Remove `"studio"` from any report fixtures and the related assertions.
- Replace the `installMaestro` mock with `prepareMaestro` and add an `onMaestroProgress` stub returning a no-op unsubscribe. Rename the "Installer" test to "Préparer":

```ts
const prepareMaestro = vi.fn();
const onMaestroProgress = vi.fn(() => () => {});
// ...in beforeEach:
	prepareMaestro.mockReset();
	prepareMaestro.mockResolvedValue({ ok: true });
// ...in the api stub object:
	prepareMaestro,
	onMaestroProgress,
```

```ts
	it("Maestro absent → bouton « Préparer » lance prepareMaestro puis revérifie", async () => {
		// report fixture with maestro.ok === false (no studio field)
		// ... render ...
		await userEvent.click(
			await screen.findByRole("button", { name: /Préparer/i }),
		);
		await waitFor(() => expect(prepareMaestro).toHaveBeenCalledTimes(1));
	});
```

> Read the file first to mirror its report fixtures (now without `studio`) and its `setApi` helper. Any fixture object must drop the `studio` key to satisfy the new `MobileDoctorReport` type.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/mobileDoctor.test.tsx`
Expected: FAIL — `studioDownloadUrl` import missing; button labelled "Installer".

- [ ] **Step 3: Edit `MobileDoctor.tsx`**

1. Remove `"studio"` from `CHECK_KEYS` (line 12-18):

```ts
const CHECK_KEYS: Array<keyof Omit<MobileDoctorReport, "allOk">> = [
	"java",
	"maestro",
	"adb",
	"device",
];
```

2. Delete `studioDownloadUrl` (lines 26-33).

3. Replace the `installing`/`installError` state + `installCli` with a `preparing`/`prepareError`/`progress` flow. Replace `const [installing, setInstalling] = useState(false);` and `const [installError, setInstallError] = useState("");` (lines 72-73) with:

```ts
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState("");
	const [progress, setProgress] = useState<number | null>(null);
```

4. Subscribe to progress — add an effect after the existing mount effect (after line 92):

```ts
	useEffect(() => {
		const off = window.api.onMaestroProgress(({ received, total }) => {
			setProgress(total > 0 ? Math.round((received / total) * 100) : null);
		});
		return off;
	}, []);
```

5. Replace `installCli` (lines 104-118) with `prepareMaestro`:

```ts
	// Télécharge le binaire Maestro géré (spinner + % via onMaestroProgress).
	async function prepareMaestro(): Promise<void> {
		setPreparing(true);
		setPrepareError("");
		setProgress(null);
		try {
			const res = await window.api.prepareMaestro();
			if (!res?.ok)
				setPrepareError(res?.error ?? "Échec de la préparation.");
		} catch {
			setPrepareError("Échec de la préparation.");
		} finally {
			setProgress(null);
			await refresh();
			setPreparing(false);
		}
	}
```

6. Update `actionFor` — the `maestro` branch (lines 122-132) and remove the `studio` branch (lines 144-155):

```ts
		if (key === "maestro")
			return (
				<button
					type="button"
					className="otl-tab"
					disabled={preparing}
					onClick={prepareMaestro}
				>
					{preparing
						? progress !== null
							? `Préparation… ${progress}%`
							: "Préparation…"
						: "Préparer"}
				</button>
			);
```

7. Update the `extraError` wiring in the render map (line 199): replace `installError` with `prepareError`:

```tsx
								extraError={
									k === "maestro" && prepareError ? prepareError : undefined
								}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/mobileDoctor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + lint + build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all green. (Confirms no lingering references to `installMaestro`, `studio`, `studioInstalled`, `studioDownloadUrl`.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/screens/MobileDoctor.tsx tests/renderer/mobileDoctor.test.tsx
git commit -m "feat(mobile) — Diagnostic UI: bouton « Préparer » + progression, sans Studio

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q4x8Am1QcmaiT4qncW3obY"
```

**End of PR 3.** Open the PR for Phase C, watch CI to green, merge.

---

## Final verification (after all 3 PRs merged)

- [ ] `npx vitest run` — full suite green.
- [ ] `npm run lint` — no errors.
- [ ] `npm run build` — succeeds on all targets.
- [ ] `grep -rn "studioInstalled\|studioDownloadUrl\|studioPaths\|installMaestro\|installMaestroCli\|\.studio\b" src tests` — returns nothing (dead code fully removed).
- [ ] Manual smoke (optional, on the dev machine): launch the app, NewScenario → Mobile → Démarrer → the browser opens `localhost:9999`, paste a flow, « Créer le scénario » → scenario created + auto-run.
