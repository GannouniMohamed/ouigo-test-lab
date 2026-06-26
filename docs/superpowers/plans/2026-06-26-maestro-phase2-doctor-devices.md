# Maestro Mobile — Phase 2 : Doctor prérequis + module devices + IPC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter les prérequis mobiles (Java 17+, Maestro, adb, Studio desktop, appareil dispo) et lister/démarrer les appareils Android, exposés au renderer via IPC — sans dépendre d'un vrai appareil pour les tests.

**Architecture:** Phase 2 sur 6 (= 1 PR). Trois modules main sous `src/main/mobile/` : un wrapper d'exécution CLI injectable (`exec.ts`), la découverte/boot d'appareils (`devices.ts`), et le diagnostic prérequis (`doctor.ts`). Le tout câblé en IPC (`mobile:doctor`, `mobile:listDevices`, `mobile:startDevice`). Les modules prennent un `ToolRunner` injectable (défaut = spawn réel) → tests déterministes et cross-platform, sans fixtures exécutables.

**Tech Stack:** TypeScript, Node `child_process`, Vitest, Biome. Aucune nouvelle dépendance npm.

**Spec maître:** `docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md` (§7 module appareils, §8 doctor).

## Global Constraints

- **Android uniquement en v1.** Ne rien ajouter pour iOS.
- **Injectable, pas de fixture exécutable** : `devices.ts`/`doctor.ts` reçoivent un `ToolRunner` (et `doctor` un `exists`) en paramètre, défaut = implémentation réelle. Les tests passent des stubs. (Le repo utilisait l'override d'env `OTL_CODEGEN` ; ici la DI est plus simple pour des outils multi-commandes et fonctionne sur Windows/Ubuntu/macOS en CI.)
- **`runTool` ne rejette jamais** sur un binaire absent : il renvoie `{ code: -1, stdout: "", stderr: <message> }` (un binaire manquant est un état normal du doctor, pas une exception).
- **Java 17+ requis** : parser la version depuis la sortie de `java -version` (qui écrit sur **stderr**), accepter major ≥ 17.
- **Pas d'import `@playwright/test`** ni de dépendance lourde dans ces modules main (cf. mémoire projet).
- **Copie en français** pour tous les `hint` du doctor.
- **Tests** dans `tests/main/`. Lancer : `npm test` ; lint : `npm run lint`.
- **Commits** en français façon repo (`feat(...) — …`).

## File Structure

- `src/main/mobile/exec.ts` — `ExecResult`, `ToolRunner`, `runTool` (spawn réel), `toolBin`.
- `src/main/mobile/devices.ts` — `listDevices`, `startDevice` (parse `adb devices -l`, boot via `maestro start-device`).
- `src/main/mobile/doctor.ts` — `mobileDoctor` (java/maestro/adb/studio/appareil).
- `src/main/ipc/mobileHandlers.ts` — handlers IPC fins (délèguent aux modules).
- `src/main/ipc/register.ts` (modif) — enregistrer les 3 canaux.
- `src/preload/index.ts` (modif) + `src/renderer/api.d.ts` (modif) — exposer/typage.
- `src/shared/types.ts` (modif) — `DoctorCheck`, `MobileDoctorReport`.
- Tests : `tests/main/mobileExec.test.ts`, `tests/main/mobileDevices.test.ts`, `tests/main/mobileDoctor.test.ts`, `tests/main/mobileIpc.test.ts`.

---

### Task 1: `exec.ts` — wrapper d'exécution CLI injectable

**Files:**
- Create: `src/main/mobile/exec.ts`
- Test: `tests/main/mobileExec.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `interface ExecResult { code: number; stdout: string; stderr: string }`
  - `type ToolRunner = (bin: string, args: string[]) => Promise<ExecResult>`
  - `const runTool: ToolRunner` (spawn réel ; ne rejette jamais)
  - `function toolBin(name: "java" | "maestro" | "adb"): string` (override env `OTL_<NAME>_BIN`, sinon le nom)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/mobileExec.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { runTool, toolBin } from "../../src/main/mobile/exec";

describe("runTool", () => {
	it("capture stdout et code 0 (commande node cross-platform)", async () => {
		const r = await runTool(process.execPath, [
			"-e",
			"process.stdout.write('hello')",
		]);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("hello");
	});

	it("capture stderr et un code non nul", async () => {
		const r = await runTool(process.execPath, [
			"-e",
			"process.stderr.write('boom'); process.exit(3)",
		]);
		expect(r.code).toBe(3);
		expect(r.stderr).toContain("boom");
	});

	it("ne rejette pas si le binaire est introuvable (code -1)", async () => {
		const r = await runTool("otl-binaire-inexistant-xyz", ["--version"]);
		expect(r.code).toBe(-1);
		expect(r.stderr.length).toBeGreaterThan(0);
	});
});

describe("toolBin", () => {
	it("renvoie le nom par défaut", () => {
		Reflect.deleteProperty(process.env, "OTL_ADB_BIN");
		expect(toolBin("adb")).toBe("adb");
	});

	it("honore l'override d'env OTL_<NAME>_BIN", () => {
		process.env.OTL_MAESTRO_BIN = "/opt/maestro/bin/maestro";
		expect(toolBin("maestro")).toBe("/opt/maestro/bin/maestro");
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileExec.test.ts`
Expected: FAIL — import `../../src/main/mobile/exec` introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/main/mobile/exec.ts` :

```ts
import { spawn } from "node:child_process";

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

// Un runner d'outil CLI injectable : permet de tester devices.ts/doctor.ts avec
// des sorties canned, sans vrai binaire ni appareil.
export type ToolRunner = (bin: string, args: string[]) => Promise<ExecResult>;

const isWindows = process.platform === "win32";

// Implémentation réelle. Ne rejette JAMAIS : un binaire absent est un état
// normal du doctor (code -1), pas une exception.
export const runTool: ToolRunner = (bin, args) =>
	new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (r: ExecResult) => {
			if (settled) return;
			settled = true;
			resolve(r);
		};
		try {
			const child = spawn(bin, args, { shell: isWindows });
			child.stdout?.on("data", (b: Buffer) => {
				stdout += b.toString();
			});
			child.stderr?.on("data", (b: Buffer) => {
				stderr += b.toString();
			});
			child.on("error", (err) =>
				finish({ code: -1, stdout, stderr: stderr || String(err) }),
			);
			child.on("close", (code) => finish({ code: code ?? 0, stdout, stderr }));
		} catch (err) {
			finish({ code: -1, stdout: "", stderr: String(err) });
		}
	});

// Résout le binaire d'un outil : override d'env OTL_<NAME>_BIN sinon le nom nu.
export function toolBin(name: "java" | "maestro" | "adb"): string {
	return process.env[`OTL_${name.toUpperCase()}_BIN`] || name;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileExec.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/exec.ts tests/main/mobileExec.test.ts
git commit -m "feat(mobile) — exec: wrapper CLI injectable (runTool/toolBin), ne rejette jamais"
```

---

### Task 2: Types `DoctorCheck` / `MobileDoctorReport` (partagés)

**Files:**
- Modify: `src/shared/types.ts` (après l'interface `MobileDevice`)
- Test: couvert par Task 5 (doctor) — pas de test dédié (types purs consommés par le renderer en Phase 6).

**Interfaces:**
- Produces:
  - `interface DoctorCheck { ok: boolean; label: string; version?: string; hint?: string }`
  - `interface MobileDoctorReport { allOk: boolean; java: DoctorCheck; maestro: DoctorCheck; adb: DoctorCheck; studio: DoctorCheck; device: DoctorCheck }`

- [ ] **Step 1: Ajouter les types**

Dans `src/shared/types.ts`, après l'interface `MobileDevice`, ajouter :

```ts
// Un point de contrôle du diagnostic prérequis mobile (affiché en Phase 6).
export interface DoctorCheck {
	ok: boolean;
	label: string; // ex. "Java 17+"
	version?: string; // version détectée si dispo
	hint?: string; // conseil d'installation si !ok (français)
}

// Rapport complet du doctor mobile.
export interface MobileDoctorReport {
	allOk: boolean;
	java: DoctorCheck;
	maestro: DoctorCheck;
	adb: DoctorCheck;
	studio: DoctorCheck;
	device: DoctorCheck; // au moins un appareil/émulateur joignable
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "types.ts" || echo "types OK"`
Expected: `types OK`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(mobile) — types: DoctorCheck + MobileDoctorReport"
```

---

### Task 3: `devices.ts` — `listDevices` (parse `adb devices -l`)

`adb devices -l` est la source la plus stable et parsable pour Android v1. Exemple de sortie :

```
List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:Pixel_6 device:emu64a
1A2B3C4D5E             device product:raven model:Pixel_6_Pro device:raven
ZY22FGH7KK             offline
```

**Files:**
- Create: `src/main/mobile/devices.ts`
- Test: `tests/main/mobileDevices.test.ts`

**Interfaces:**
- Consumes: `ExecResult`, `ToolRunner`, `runTool`, `toolBin` (Task 1) ; `MobileDevice` (`src/shared/types.ts`).
- Produces: `function listDevices(run?: ToolRunner): Promise<MobileDevice[]>`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/mobileDevices.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import type { ExecResult } from "../../src/main/mobile/exec";
import { listDevices } from "../../src/main/mobile/devices";

const ADB_OUT = `List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:Pixel_6 device:emu64a transport_id:1
1A2B3C4D5E             device product:raven model:Pixel_6_Pro device:raven transport_id:2
ZY22FGH7KK             offline
`;

function fakeRun(out: string): (bin: string, args: string[]) => Promise<ExecResult> {
	return async () => ({ code: 0, stdout: out, stderr: "" });
}

describe("listDevices", () => {
	it("parse les appareils adb (id, état, type, nom de modèle)", async () => {
		const devices = await listDevices(fakeRun(ADB_OUT));
		expect(devices).toHaveLength(3);

		const emu = devices[0];
		expect(emu.id).toBe("emulator-5554");
		expect(emu.state).toBe("booted");
		expect(emu.kind).toBe("emulator");
		expect(emu.name).toBe("Pixel 6"); // model:Pixel_6 → underscores en espaces

		const phys = devices[1];
		expect(phys.id).toBe("1A2B3C4D5E");
		expect(phys.kind).toBe("physical");
		expect(phys.name).toBe("Pixel 6 Pro");

		const off = devices[2];
		expect(off.id).toBe("ZY22FGH7KK");
		expect(off.state).toBe("offline");
		expect(off.name).toBe("ZY22FGH7KK"); // pas de model → fallback sur l'id
	});

	it("renvoie [] quand aucun appareil n'est attaché", async () => {
		const devices = await listDevices(fakeRun("List of devices attached\n\n"));
		expect(devices).toEqual([]);
	});

	it("renvoie [] si adb est introuvable (code -1)", async () => {
		const devices = await listDevices(async () => ({
			code: -1,
			stdout: "",
			stderr: "not found",
		}));
		expect(devices).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileDevices.test.ts`
Expected: FAIL — import `devices` introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/main/mobile/devices.ts` :

```ts
import type { MobileDevice } from "../../shared/types";
import { type ToolRunner, runTool, toolBin } from "./exec";

// Extrait la valeur d'un champ `clé:valeur` d'une ligne `adb devices -l`.
function field(rest: string, key: string): string | undefined {
	const m = new RegExp(`${key}:(\\S+)`).exec(rest);
	return m ? m[1] : undefined;
}

// Liste les appareils/émulateurs Android via `adb devices -l`. Source la plus
// stable et parsable pour la v1. Ne lève jamais : renvoie [] en cas d'échec.
export async function listDevices(
	run: ToolRunner = runTool,
): Promise<MobileDevice[]> {
	const { code, stdout } = await run(toolBin("adb"), ["devices", "-l"]);
	if (code !== 0) return [];

	const devices: MobileDevice[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("List of devices")) continue;
		const [id, status, ...rest] = trimmed.split(/\s+/);
		if (!id || !status) continue;
		const restStr = rest.join(" ");
		const model = field(restStr, "model");
		devices.push({
			id,
			name: model ? model.replace(/_/g, " ") : id,
			kind: id.startsWith("emulator-") ? "emulator" : "physical",
			state: status === "device" ? "booted" : "offline",
		});
	}
	return devices;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileDevices.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/devices.ts tests/main/mobileDevices.test.ts
git commit -m "feat(mobile) — devices: listDevices parse 'adb devices -l'"
```

---

### Task 4: `devices.ts` — `startDevice` (boot émulateur)

**Files:**
- Modify: `src/main/mobile/devices.ts`
- Test: `tests/main/mobileDevices.test.ts` (ajout)

**Interfaces:**
- Produces: `function startDevice(run?: ToolRunner): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Écrire le test qui échoue (ajout au fichier)**

Ajouter dans `tests/main/mobileDevices.test.ts` (et l'import) :

```ts
import { listDevices, startDevice } from "../../src/main/mobile/devices";

describe("startDevice", () => {
	it("invoque `maestro start-device --platform android` et renvoie ok", async () => {
		let calledBin = "";
		let calledArgs: string[] = [];
		const res = await startDevice(async (bin, args) => {
			calledBin = bin;
			calledArgs = args;
			return { code: 0, stdout: "Device started", stderr: "" };
		});
		expect(calledBin).toBe("maestro");
		expect(calledArgs).toEqual(["start-device", "--platform", "android"]);
		expect(res.ok).toBe(true);
	});

	it("renvoie ok=false + message si le boot échoue", async () => {
		const res = await startDevice(async () => ({
			code: 1,
			stdout: "",
			stderr: "no avd configured",
		}));
		expect(res.ok).toBe(false);
		expect(res.error).toContain("no avd configured");
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileDevices.test.ts`
Expected: FAIL — `startDevice` n'est pas exporté.

- [ ] **Step 3: Écrire l'implémentation minimale (ajout en fin de `devices.ts`)**

```ts
// Démarre un émulateur Android via Maestro (gère la création/boot de l'AVD par
// défaut). Long : Maestro résout une fois l'appareil booté.
export async function startDevice(
	run: ToolRunner = runTool,
): Promise<{ ok: boolean; error?: string }> {
	const { code, stderr } = await run(toolBin("maestro"), [
		"start-device",
		"--platform",
		"android",
	]);
	if (code === 0) return { ok: true };
	return { ok: false, error: stderr.trim() || `maestro a quitté (code ${code})` };
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileDevices.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/devices.ts tests/main/mobileDevices.test.ts
git commit -m "feat(mobile) — devices: startDevice (maestro start-device --platform android)"
```

---

### Task 5: `doctor.ts` — `mobileDoctor`

**Files:**
- Create: `src/main/mobile/doctor.ts`
- Test: `tests/main/mobileDoctor.test.ts`

**Interfaces:**
- Consumes: `ExecResult`, `ToolRunner`, `runTool`, `toolBin` (Task 1) ; `listDevices` (Task 3) ; `DoctorCheck`, `MobileDoctorReport` (Task 2).
- Produces:
  - `function parseJavaMajor(versionOutput: string): number | null` (exporté pour test)
  - `function mobileDoctor(deps?: { run?: ToolRunner; exists?: (p: string) => boolean }): Promise<MobileDoctorReport>`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/mobileDoctor.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import type { ExecResult } from "../../src/main/mobile/exec";
import { mobileDoctor, parseJavaMajor } from "../../src/main/mobile/doctor";

describe("parseJavaMajor", () => {
	it("extrait 17 d'un openjdk 17.x", () => {
		expect(parseJavaMajor('openjdk version "17.0.8" 2023-07-18')).toBe(17);
	});
	it("extrait 8 du schéma legacy 1.8.0", () => {
		expect(parseJavaMajor('java version "1.8.0_381"')).toBe(8);
	});
	it("renvoie null si illisible", () => {
		expect(parseJavaMajor("commande introuvable")).toBeNull();
	});
});

// Routeur de stub : renvoie une sortie canned selon le binaire appelé.
function router(map: Record<string, ExecResult>) {
	return async (bin: string): Promise<ExecResult> =>
		map[bin] ?? { code: -1, stdout: "", stderr: "not found" };
}

describe("mobileDoctor", () => {
	it("tout vert quand java17+/maestro/adb/studio/appareil sont présents", async () => {
		const report = await mobileDoctor({
			run: router({
				java: { code: 0, stdout: "", stderr: 'openjdk version "17.0.8"' },
				maestro: { code: 0, stdout: "1.39.0", stderr: "" },
				adb: {
					code: 0,
					stdout: "List of devices attached\nemulator-5554 device model:Pixel_6\n",
					stderr: "",
				},
			}),
			exists: () => true,
		});
		expect(report.java.ok).toBe(true);
		expect(report.java.version).toBe("17");
		expect(report.maestro.ok).toBe(true);
		expect(report.adb.ok).toBe(true);
		expect(report.studio.ok).toBe(true);
		expect(report.device.ok).toBe(true);
		expect(report.allOk).toBe(true);
	});

	it("java < 17 → java.ok=false avec un hint, allOk=false", async () => {
		const report = await mobileDoctor({
			run: router({
				java: { code: 0, stdout: "", stderr: 'java version "1.8.0_381"' },
				maestro: { code: 0, stdout: "1.39.0", stderr: "" },
				adb: { code: 0, stdout: "List of devices attached\n", stderr: "" },
			}),
			exists: () => true,
		});
		expect(report.java.ok).toBe(false);
		expect(report.java.hint).toBeTruthy();
		expect(report.allOk).toBe(false);
	});

	it("binaires absents → checks ko avec hints, device ko", async () => {
		const report = await mobileDoctor({
			run: router({}), // tout renvoie code -1
			exists: () => false,
		});
		expect(report.maestro.ok).toBe(false);
		expect(report.maestro.hint).toContain("maestro");
		expect(report.adb.ok).toBe(false);
		expect(report.studio.ok).toBe(false);
		expect(report.device.ok).toBe(false);
		expect(report.allOk).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileDoctor.test.ts`
Expected: FAIL — import `doctor` introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/main/mobile/doctor.ts` :

```ts
import { existsSync } from "node:fs";
import type { DoctorCheck, MobileDoctorReport } from "../../shared/types";
import { listDevices } from "./devices";
import { type ToolRunner, runTool, toolBin } from "./exec";

const MIN_JAVA = 17;

// Extrait la version majeure depuis la sortie de `java -version`.
// Gère "17.0.8" → 17 et le legacy "1.8.0_x" → 8.
export function parseJavaMajor(versionOutput: string): number | null {
	const m = /version\s+"(\d+)(?:\.(\d+))?/.exec(versionOutput);
	if (!m) return null;
	const major = Number(m[1]);
	if (major === 1 && m[2]) return Number(m[2]); // 1.8 → 8
	return major;
}

// Emplacements probables de l'app Maestro Studio desktop par OS.
function studioPaths(): string[] {
	if (process.platform === "darwin")
		return ["/Applications/Maestro Studio.app"];
	if (process.platform === "win32")
		return [
			`${process.env.LOCALAPPDATA ?? ""}\\Programs\\Maestro Studio\\Maestro Studio.exe`,
		];
	return [`${process.env.HOME ?? ""}/.local/bin/maestro-studio`];
}

export async function mobileDoctor(deps?: {
	run?: ToolRunner;
	exists?: (p: string) => boolean;
}): Promise<MobileDoctorReport> {
	const run = deps?.run ?? runTool;
	const exists = deps?.exists ?? existsSync;

	// Java 17+
	const javaOut = await run(toolBin("java"), ["-version"]);
	// `java -version` écrit sur stderr.
	const javaMajor = parseJavaMajor(javaOut.stderr || javaOut.stdout);
	const java: DoctorCheck = {
		label: "Java 17+",
		ok: javaMajor !== null && javaMajor >= MIN_JAVA,
		version: javaMajor !== null ? String(javaMajor) : undefined,
		hint:
			javaMajor !== null && javaMajor >= MIN_JAVA
				? undefined
				: "Installe un JDK 17+ (ex. `brew install openjdk@17` ou Adoptium Temurin) et configure JAVA_HOME.",
	};

	// Maestro CLI
	const maestroOut = await run(toolBin("maestro"), ["--version"]);
	const maestro: DoctorCheck = {
		label: "Maestro CLI",
		ok: maestroOut.code === 0,
		version: maestroOut.code === 0 ? maestroOut.stdout.trim() : undefined,
		hint:
			maestroOut.code === 0
				? undefined
				: "Installe maestro : `curl -fsSL https://get.maestro.mobile.dev | bash`.",
	};

	// adb (Android SDK platform-tools)
	const adbOut = await run(toolBin("adb"), ["version"]);
	const adb: DoctorCheck = {
		label: "adb (Android SDK)",
		ok: adbOut.code === 0,
		version: adbOut.code === 0 ? adbOut.stdout.split("\n")[0]?.trim() : undefined,
		hint:
			adbOut.code === 0
				? undefined
				: "Installe l'Android SDK platform-tools et ajoute `adb` au PATH.",
	};

	// Maestro Studio desktop (présence du fichier)
	const studioOk = studioPaths().some((p) => exists(p));
	const studio: DoctorCheck = {
		label: "Maestro Studio (desktop)",
		ok: studioOk,
		hint: studioOk
			? undefined
			: "Installe l'app Maestro Studio desktop depuis https://maestro.dev (nécessaire pour enregistrer un parcours).",
	};

	// Au moins un appareil/émulateur joignable
	const devices = await listDevices(run);
	const bootedCount = devices.filter((d) => d.state === "booted").length;
	const device: DoctorCheck = {
		label: "Appareil / émulateur",
		ok: bootedCount > 0,
		version: bootedCount > 0 ? `${bootedCount} dispo` : undefined,
		hint:
			bootedCount > 0
				? undefined
				: "Branche un téléphone (débogage USB activé) ou démarre un émulateur.",
	};

	const allOk =
		java.ok && maestro.ok && adb.ok && studio.ok && device.ok;
	return { allOk, java, maestro, adb, studio, device };
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileDoctor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mobile/doctor.ts tests/main/mobileDoctor.test.ts
git commit -m "feat(mobile) — doctor: mobileDoctor (java17+/maestro/adb/studio/appareil)"
```

---

### Task 6: Câblage IPC + preload + typage renderer

**Files:**
- Create: `src/main/ipc/mobileHandlers.ts`
- Modify: `src/main/ipc/register.ts` (imports + 3 `ipcMain.handle`)
- Modify: `src/preload/index.ts` (3 méthodes)
- Modify: `src/renderer/api.d.ts` (imports `MobileDevice`, `MobileDoctorReport` + 3 signatures)
- Test: `tests/main/mobileIpc.test.ts`

**Interfaces:**
- Consumes: `mobileDoctor` (Task 5), `listDevices`/`startDevice` (Tasks 3-4), `MobileDevice`/`MobileDoctorReport` (types).
- Produces (handlers) :
  - `function handleMobileDoctor(): Promise<MobileDoctorReport>`
  - `function handleListDevices(): Promise<MobileDevice[]>`
  - `function handleStartDevice(): Promise<{ ok: boolean; error?: string }>`
  - Canaux IPC : `mobile:doctor`, `mobile:listDevices`, `mobile:startDevice`
  - API renderer : `window.api.mobileDoctor()`, `window.api.listDevices()`, `window.api.startDevice()`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/mobileIpc.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
	handleListDevices,
	handleMobileDoctor,
	handleStartDevice,
} from "../../src/main/ipc/mobileHandlers";

// Pas de vrai appareil/binaire en CI : adb/maestro/java sont absents, donc les
// handlers doivent renvoyer des résultats dégradés cohérents sans lever.
describe("mobileHandlers", () => {
	it("handleMobileDoctor renvoie un rapport (dégradé) sans lever", async () => {
		const report = await handleMobileDoctor();
		expect(report).toHaveProperty("allOk");
		expect(report).toHaveProperty("java");
		expect(typeof report.allOk).toBe("boolean");
	});

	it("handleListDevices renvoie un tableau", async () => {
		const devices = await handleListDevices();
		expect(Array.isArray(devices)).toBe(true);
	});

	it("handleStartDevice renvoie un objet { ok }", async () => {
		const res = await handleStartDevice();
		expect(res).toHaveProperty("ok");
		expect(typeof res.ok).toBe("boolean");
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/mobileIpc.test.ts`
Expected: FAIL — import `mobileHandlers` introuvable.

- [ ] **Step 3: Écrire les handlers**

Créer `src/main/ipc/mobileHandlers.ts` :

```ts
import type { MobileDevice, MobileDoctorReport } from "../../shared/types";
import { listDevices, startDevice } from "../mobile/devices";
import { mobileDoctor } from "../mobile/doctor";

export function handleMobileDoctor(): Promise<MobileDoctorReport> {
	return mobileDoctor();
}

export function handleListDevices(): Promise<MobileDevice[]> {
	return listDevices();
}

export function handleStartDevice(): Promise<{ ok: boolean; error?: string }> {
	return startDevice();
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/mobileIpc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Câbler register.ts**

Dans `src/main/ipc/register.ts`, ajouter l'import près des autres :

```ts
import {
	handleListDevices,
	handleMobileDoctor,
	handleStartDevice,
} from "./mobileHandlers";
```

Puis, à la fin de `registerIpc()` (avant la fermeture de la fonction), ajouter :

```ts
	// Mobile (Maestro)
	ipcMain.handle("mobile:doctor", () => handleMobileDoctor());
	ipcMain.handle("mobile:listDevices", () => handleListDevices());
	ipcMain.handle("mobile:startDevice", () => handleStartDevice());
```

- [ ] **Step 6: Exposer dans preload**

Dans `src/preload/index.ts`, ajouter dans l'objet exposé (après `installBrowsers`) :

```ts
	mobileDoctor() {
		return ipcRenderer.invoke("mobile:doctor");
	},
	listDevices() {
		return ipcRenderer.invoke("mobile:listDevices");
	},
	startDevice() {
		return ipcRenderer.invoke("mobile:startDevice");
	},
```

- [ ] **Step 7: Typage renderer**

Dans `src/renderer/api.d.ts`, ajouter `MobileDevice` et `MobileDoctorReport` à l'import depuis `../shared/types`, puis dans `interface OtlApi` (après `installBrowsers`) :

```ts
	mobileDoctor(): Promise<MobileDoctorReport>;
	listDevices(): Promise<MobileDevice[]>;
	startDevice(): Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 8: Suite complète + lint**

Run: `npm test`
Expected: PASS (toute la suite).

Run: `npm run lint`
Expected: aucune erreur Biome.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "mobile|api.d.ts|preload|register" || echo "mes fichiers OK"`
Expected: `mes fichiers OK`.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/mobileHandlers.ts src/main/ipc/register.ts src/preload/index.ts src/renderer/api.d.ts tests/main/mobileIpc.test.ts
git commit -m "feat(mobile) — IPC: mobile:doctor / listDevices / startDevice + preload + typage"
```

---

## Clôture de la Phase 2 (= ouverture de la PR)

- [ ] **Pousser + PR**

```bash
git push -u origin feat/maestro-phase2-doctor-devices
gh pr create --title "feat(mobile) — Phase 2 : doctor prérequis + module devices + IPC" \
  --body "Phase 2/6. Détection prérequis (Java 17+/Maestro/adb/Studio/appareil) + listDevices/startDevice (Android) + IPC mobile:doctor/listDevices/startDevice. Modules injectables (ToolRunner) → tests déterministes sans appareil réel. Spec : docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Critère de done** : CI verte (Vitest + lint + build + E2E) sur les 3 OS.

## Couverture du spec (auto-revue)

- §8 doctor (`java`/`maestro`/`adb`/`studio`/`anyDeviceAvailable`, hints français, jamais de stack trace) → Tasks 2 & 5. ✅
- §7 module appareils (`listDevices` via adb, `startDevice` via maestro) → Tasks 3 & 4. ✅
- §7 IPC `mobile:listDevices`/`startDevice` + §8 `mobile:doctor` → Task 6. ✅
- §9 tests derrière un seam injectable, pas d'appareil réel en CI → `ToolRunner`/`exists` injectés (Tasks 1,3,4,5) + handlers dégradés (Task 6). ✅
- Garde-fou Windows iOS-masqué → relève de l'UI (Phase 6), hors Phase 2.
