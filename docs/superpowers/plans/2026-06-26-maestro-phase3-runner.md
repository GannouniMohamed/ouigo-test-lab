# Maestro Mobile — Phase 3 : maestroRunner + report mapper + dispatch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exécuter un flow Maestro existant sur un appareil Android et restituer le **même** `Report`/`RunEvent` que le chemin web, via un `maestroRunner` qui implémente l'interface `TestRunner` ; le dispatch par plateforme est ajouté à `handleRunScenario`.

**Architecture:** Phase 3 sur 6 (= 1 PR). `maestroReportMapper.ts` (pur, testé) construit un `Report` à partir du XML JUnit (statut/durée faisant foi) et du stdout Maestro (granularité par étape, best-effort). `maestroRunner.ts` implémente `TestRunner` en miroir de `playwrightRunner` (spawn via `toolBin("maestro")` → testable avec une fixture fake-maestro). `handleRunScenario` choisit le runner selon `scenario.platform` ; `run:cancel` cible les deux runners.

**Tech Stack:** TypeScript, Node `child_process`, Vitest, Biome. Aucune nouvelle dépendance npm.

**Spec maître:** `docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md` (§7 flow d'exécution).
**Phases acquises:** Phase 1 (`shared/flow.ts` : `rebaseFlowAppId`, `parseFlowSteps`), Phase 2 (`mobile/exec.ts` : `runTool`/`toolBin`).

## Global Constraints

- **Android uniquement en v1.** Pas de modes `visible/invisible` pour le mobile (les flows Maestro n'ont pas de dualité headed/headless) → `RunMode` ignoré côté mobile.
- **Même contrat que le web** : `maestroRunner` implémente `TestRunner` (`run`/`cancel`) et émet les mêmes `RunEvent` (`run-started`/`step-*`/`run-finished`) et le même `Report`. Le renderer reste inchangé.
- **Phase 3 = source d'app « installed »** : l'app est supposée déjà sur l'appareil. La récupération Firebase (`ensureAppOnDevice` complet) est la Phase 4 ; ici, un helper `prepareApp` gère uniquement `installed` (no-op) et renvoie une erreur mappée pour `firebase` (« récupération Firebase : Phase 4 »).
- **Testable sans appareil réel** : `maestroRunner` spawne `maestro` via `toolBin("maestro")` ; les tests pointent `OTL_MAESTRO_BIN` sur une fixture node `tests/fixtures/fake-maestro.mjs` (cross-platform).
- **Statut faisant foi = JUnit** ; stdout = best-effort pour la granularité par étape. Si le stdout n'est pas parsable, le rapport reste correct au niveau global.
- **Erreurs mappées** (jamais de stack brute) : appId manquant, deviceId manquant, source firebase (Phase 4), maestro absent, sortie sans rapport.
- **Copie en français.** Tests dans `tests/main/`. `npm test` / `npm run lint`.
- **Commits** en français façon repo.

## File Structure

- `src/main/runner/maestroReportMapper.ts` — `parseJUnitStatus`, `parseMaestroSteps`, `buildMaestroReport` (purs).
- `src/main/runner/maestroRunner.ts` — `maestroRunner: TestRunner` + `prepareApp`.
- `src/main/ipc/handlers.ts` (modif) — dispatch runner par plateforme dans `handleRunScenario`.
- `src/main/ipc/register.ts` (modif) — `run:cancel` cible les deux runners.
- Tests : `tests/main/maestroReportMapper.test.ts`, `tests/main/maestroRunner.test.ts`, `tests/main/runDispatch.test.ts`.
- Fixture : `tests/fixtures/fake-maestro.mjs`.

---

### Task 1: `maestroReportMapper.ts` — mapping pur

**Files:**
- Create: `src/main/runner/maestroReportMapper.ts`
- Test: `tests/main/maestroReportMapper.test.ts`

**Interfaces:**
- Consumes: `Report`, `ReportStep`, `RunStatus`, `StepStatus` (`src/shared/types.ts`).
- Produces:
  - `interface MaestroMapCtx { runId: string; scenarioId: string; scenarioName: string; projectId?: string; tunnelId?: string; environmentId?: string; environmentLabel: string; startedAt: string; durationMs: number; planTitles: string[] }`
  - `function parseJUnitStatus(xml: string): { failed: boolean; message?: string }`
  - `function parseMaestroSteps(stdout: string): StepStatus[]`
  - `function buildMaestroReport(ctx: MaestroMapCtx, stdout: string, junitXml: string): Report`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/maestroReportMapper.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
	buildMaestroReport,
	parseJUnitStatus,
	parseMaestroSteps,
	type MaestroMapCtx,
} from "../../src/main/runner/maestroReportMapper";

const JUNIT_PASS = `<?xml version="1.0"?>
<testsuites><testsuite name="flow" tests="1" failures="0">
<testcase name="my flow"/></testsuite></testsuites>`;

const JUNIT_FAIL = `<?xml version="1.0"?>
<testsuites><testsuite name="flow" tests="1" failures="1">
<testcase name="my flow"><failure>Assertion "Bienvenue" failed</failure></testcase>
</testsuite></testsuites>`;

const STDOUT_PASS = `Running on emulator-5554
  ✅  Launch app "com.ouigo.app"
  ✅  Tap on "Connexion"
  ✅  Assert visible "Bienvenue"
`;

const STDOUT_FAIL = `Running on emulator-5554
  ✅  Launch app "com.ouigo.app"
  ✅  Tap on "Connexion"
  ❌  Assert visible "Bienvenue"
`;

function ctx(over: Partial<MaestroMapCtx> = {}): MaestroMapCtx {
	return {
		runId: "r1",
		scenarioId: "s1",
		scenarioName: "Mon parcours",
		environmentLabel: "Préprod",
		startedAt: "2026-06-26T10:00:00Z",
		durationMs: 4200,
		planTitles: ['launchApp:', 'tapOn: "Connexion"', 'assertVisible: "Bienvenue"'],
		...over,
	};
}

describe("parseJUnitStatus", () => {
	it("détecte un succès", () => {
		expect(parseJUnitStatus(JUNIT_PASS)).toEqual({ failed: false });
	});
	it("détecte un échec et extrait le message", () => {
		const r = parseJUnitStatus(JUNIT_FAIL);
		expect(r.failed).toBe(true);
		expect(r.message).toContain("Bienvenue");
	});
	it("XML illisible → considéré échoué (sécurité)", () => {
		expect(parseJUnitStatus("pas du xml").failed).toBe(true);
	});
});

describe("parseMaestroSteps", () => {
	it("lit les glyphes ✅/❌ dans l'ordre", () => {
		expect(parseMaestroSteps(STDOUT_FAIL)).toEqual([
			"passed",
			"passed",
			"failed",
		]);
	});
	it("renvoie [] si aucun glyphe", () => {
		expect(parseMaestroSteps("aucun marqueur ici")).toEqual([]);
	});
});

describe("buildMaestroReport", () => {
	it("run passant : toutes les étapes passed, statut passed", () => {
		const report = buildMaestroReport(ctx(), STDOUT_PASS, JUNIT_PASS);
		expect(report.status).toBe("passed");
		expect(report.steps).toHaveLength(3);
		expect(report.steps.every((s) => s.status === "passed")).toBe(true);
		expect(report.steps.map((s) => s.title)).toEqual(ctx().planTitles);
		expect(report.durationMs).toBe(4200);
	});

	it("run échouant : étape en échec marquée, suivantes 'skipped', message porté", () => {
		const report = buildMaestroReport(ctx(), STDOUT_FAIL, JUNIT_FAIL);
		expect(report.status).toBe("failed");
		expect(report.steps[0].status).toBe("passed");
		expect(report.steps[1].status).toBe("passed");
		expect(report.steps[2].status).toBe("failed");
		expect(report.steps[2].error).toContain("Bienvenue");
	});

	it("échec sur étape médiane → étapes suivantes 'skipped' (non atteintes)", () => {
		const report = buildMaestroReport(
			ctx(),
			`  ✅  Launch\n  ❌  Tap\n`,
			JUNIT_FAIL,
		);
		expect(report.steps[0].status).toBe("passed");
		expect(report.steps[1].status).toBe("failed");
		expect(report.steps[2].status).toBe("skipped");
	});

	it("JUnit échec mais stdout vide → statut failed, étapes 'skipped'", () => {
		const report = buildMaestroReport(ctx(), "", JUNIT_FAIL);
		expect(report.status).toBe("failed");
		expect(report.steps.every((s) => s.status === "skipped")).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/maestroReportMapper.test.ts`
Expected: FAIL — import introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/main/runner/maestroReportMapper.ts` :

```ts
import type { Report, ReportStep, StepStatus } from "../../shared/types";

export interface MaestroMapCtx {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	projectId?: string;
	tunnelId?: string;
	environmentId?: string;
	environmentLabel: string;
	startedAt: string;
	durationMs: number;
	planTitles: string[];
}

// Statut global faisant foi : lu depuis le XML JUnit produit par
// `maestro test --format junit`. Un XML illisible est traité comme un échec
// (on ne déclare jamais un run vert par défaut).
export function parseJUnitStatus(xml: string): {
	failed: boolean;
	message?: string;
} {
	if (!xml || !/<testsuite/i.test(xml)) return { failed: true };
	const failuresAttr = /failures="(\d+)"/i.exec(xml);
	const hasFailureTag = /<(failure|error)\b/i.test(xml);
	const failed =
		(failuresAttr ? Number(failuresAttr[1]) > 0 : false) || hasFailureTag;
	const msg = /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/i.exec(
		xml,
	);
	const inlineMsg = /<(?:failure|error)\b[^>]*\bmessage="([^"]*)"/i.exec(xml);
	const message = (msg?.[1] || inlineMsg?.[1] || "").trim() || undefined;
	return message ? { failed, message } : { failed };
}

// Granularité par étape (best-effort) : on lit les glyphes ✅/❌ du stdout
// Maestro, dans l'ordre. Pas de protocole stable → on reste tolérant.
export function parseMaestroSteps(stdout: string): StepStatus[] {
	const out: StepStatus[] = [];
	for (const line of stdout.split("\n")) {
		if (/✅|\[Passed\]|\bPASSED\b/.test(line)) out.push("passed");
		else if (/❌|\[Failed\]|\bFAILED\b/.test(line)) out.push("failed");
	}
	return out;
}

// Construit le Report : ossature = plan du flow (planTitles) ; statut par étape
// depuis le stdout, recoupé avec le statut global JUnit. Une étape après l'échec
// est "skipped" (non atteinte).
export function buildMaestroReport(
	ctx: MaestroMapCtx,
	stdout: string,
	junitXml: string,
): Report {
	const junit = parseJUnitStatus(junitXml);
	const stepStatuses = parseMaestroSteps(stdout);
	const failedIndex = stepStatuses.indexOf("failed");

	const steps: ReportStep[] = ctx.planTitles.map((title, i) => {
		let status: StepStatus;
		if (failedIndex >= 0 && i > failedIndex) status = "skipped";
		else if (i < stepStatuses.length) status = stepStatuses[i];
		else status = junit.failed ? "skipped" : "passed";
		const step: ReportStep = { index: i, title, status, durationMs: 0 };
		if (status === "failed" && junit.message) step.error = junit.message;
		return step;
	});

	const anyFailed = steps.some((s) => s.status === "failed");
	const status = junit.failed || anyFailed ? "failed" : "passed";

	return {
		runId: ctx.runId,
		scenarioId: ctx.scenarioId,
		scenarioName: ctx.scenarioName,
		projectId: ctx.projectId,
		tunnelId: ctx.tunnelId,
		environmentId: ctx.environmentId,
		environmentLabel: ctx.environmentLabel,
		status,
		durationMs: ctx.durationMs,
		startedAt: ctx.startedAt,
		steps,
	};
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/maestroReportMapper.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/runner/maestroReportMapper.ts tests/main/maestroReportMapper.test.ts
git commit -m "feat(mobile) — maestroReportMapper: JUnit (statut) + stdout (étapes) → Report"
```

---

### Task 2: `maestroRunner.ts` — implémente `TestRunner`

**Files:**
- Create: `src/main/runner/maestroRunner.ts`
- Create: `tests/fixtures/fake-maestro.mjs`
- Test: `tests/main/maestroRunner.test.ts`

**Interfaces:**
- Consumes: `TestRunner` (`src/main/runner/types.ts`) ; `buildMaestroReport`/`MaestroMapCtx` (Task 1) ; `rebaseFlowAppId`/`parseFlowSteps` (`src/shared/flow.ts`) ; `toolBin` (`src/main/mobile/exec.ts`) ; `saveReport` (`reportStore`) ; `updateLastRun` (`scenarioStore`) ; `getWorkspaceDir` (`workspace`).
- Produces: `const maestroRunner: TestRunner`

- [ ] **Step 1: Écrire la fixture fake-maestro**

Créer `tests/fixtures/fake-maestro.mjs` :

```js
// Fausse CLI Maestro pour tester maestroRunner sans appareil réel.
// Émule `maestro [--device X] test --format junit --output <xml> --debug-output <dir> <flow>`.
// OTL_FAKE_MAESTRO_FAIL=1 → produit un run en échec.
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--output");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
const fail = process.env.OTL_FAKE_MAESTRO_FAIL === "1";

if (fail) {
	process.stdout.write("  ✅  Launch app\n");
	process.stdout.write("  ❌  Assert visible\n");
	if (outPath)
		writeFileSync(
			outPath,
			'<testsuites><testsuite failures="1"><testcase name="f"><failure>échec assertion</failure></testcase></testsuite></testsuites>',
		);
	process.exit(1);
} else {
	process.stdout.write("  ✅  Launch app\n");
	process.stdout.write("  ✅  Assert visible\n");
	if (outPath)
		writeFileSync(
			outPath,
			'<testsuites><testsuite failures="0"><testcase name="f"/></testsuite></testsuites>',
		);
	process.exit(0);
}
```

- [ ] **Step 2: Écrire le test qui échoue**

Créer `tests/main/maestroRunner.test.ts` :

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maestroRunner } from "../../src/main/runner/maestroRunner";
import * as projectStore from "../../src/main/stores/projectStore";
import * as scenarioStore from "../../src/main/stores/scenarioStore";
import type {
	Environment,
	RunEvent,
	Scenario,
} from "../../src/shared/types";

const FAKE = resolve(process.cwd(), "tests/fixtures/fake-maestro.mjs");
let dir: string;

function mobileEnv(over: Partial<Environment> = {}): Environment {
	return {
		id: "preprod",
		label: "Préprod",
		baseURL: "",
		variables: {},
		app: { appId: "com.ouigo.app", source: "installed" },
		...over,
	};
}

function mobileScenario(): Scenario {
	return {
		id: "parcours",
		projectId: "p1",
		tunnelId: "general",
		name: "Parcours mobile",
		platform: "mobile",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "parcours.flow.yaml",
		createdAt: "2026-06-26T00:00:00Z",
		lastRun: { status: "never" },
	};
}

function writeScenarioFlow(scenario: Scenario, flow: string): void {
	const d = join(
		dir,
		"projects",
		scenario.projectId,
		"tunnels",
		scenario.tunnelId,
		"scenarios",
		scenario.id,
	);
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, scenario.specFile), flow, "utf-8");
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrun-"));
	process.env.OTL_WORKSPACE = dir;
	// pointe maestro sur la fixture node (cross-platform)
	process.env.OTL_MAESTRO_BIN = process.execPath;
	process.env.OTL_MAESTRO_BIN_ARGS = FAKE; // voir note d'impl
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of [
		"OTL_WORKSPACE",
		"OTL_MAESTRO_BIN",
		"OTL_MAESTRO_BIN_ARGS",
		"OTL_FAKE_MAESTRO_FAIL",
	])
		Reflect.deleteProperty(process.env, k);
});

const FLOW = `appId: com.recorded
---
- launchApp
- assertVisible: "Bienvenue"
`;

describe("maestroRunner", () => {
	it("run passant : émet run-started/run-finished, persiste un rapport vert", async () => {
		const scenario = mobileScenario();
		writeScenarioFlow(scenario, FLOW);
		const events: RunEvent[] = [];
		const res = await maestroRunner.run(
			scenario,
			mobileEnv(),
			(e) => events.push(e),
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("passed");
		expect(events[0].type).toBe("run-started");
		expect(events.at(-1)).toMatchObject({ type: "run-finished", status: "passed" });
	});

	it("run échouant : statut failed", async () => {
		process.env.OTL_FAKE_MAESTRO_FAIL = "1";
		const scenario = mobileScenario();
		writeScenarioFlow(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {}, {
			deviceId: "emulator-5554",
		});
		expect(res.status).toBe("failed");
	});

	it("sans deviceId → rapport d'échec mappé (pas d'exception)", async () => {
		const scenario = mobileScenario();
		writeScenarioFlow(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {});
		expect(res.status).toBe("failed");
		expect(res.report.steps[0].error).toContain("appareil");
	});

	it("env sans app → rapport d'échec mappé", async () => {
		const scenario = mobileScenario();
		writeScenarioFlow(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({ app: undefined }),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		expect(res.report.steps[0].error).toContain("application");
	});

	it("source firebase → rapport d'échec mappé (Phase 4)", async () => {
		const scenario = mobileScenario();
		writeScenarioFlow(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({
				app: { appId: "com.ouigo.app", source: "firebase" },
			}),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		expect(res.report.steps[0].error.toLowerCase()).toContain("firebase");
	});
});
```

> Note d'impl : pour permettre `OTL_MAESTRO_BIN=node` + un script, `maestroRunner` préfixe `process.env.OTL_MAESTRO_BIN_ARGS` (s'il existe) aux arguments. C'est le même artifice que `OTL_CODEGEN`/`OTL_CODEGEN_ARGS` du recorder.

- [ ] **Step 3: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/maestroRunner.test.ts`
Expected: FAIL — import `maestroRunner` introuvable.

- [ ] **Step 4: Écrire l'implémentation**

Créer `src/main/runner/maestroRunner.ts` :

```ts
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFlowSteps, rebaseFlowAppId } from "../../shared/flow";
import type {
	Environment,
	Report,
	RunEvent,
	RunOptions,
	RunResult,
	Scenario,
} from "../../shared/types";
import { toolBin } from "../mobile/exec";
import { saveReport } from "../stores/reportStore";
import { updateLastRun } from "../stores/scenarioStore";
import { getWorkspaceDir } from "../workspace";
import { buildMaestroReport } from "./maestroReportMapper";
import type { TestRunner } from "./types";

interface RunState {
	child: ChildProcess;
	cancelled: boolean;
}
const activeRuns = new Map<string, RunState>();
const isWindows = process.platform === "win32";

// Rapport d'échec minimal mappé (même esprit que buildMinimalFailedReport du
// chemin web) : une seule étape portant le message humain.
function failedReport(
	runId: string,
	scenario: Scenario,
	env: Environment,
	startedAt: string,
	durationMs: number,
	error: string,
): Report {
	return {
		runId,
		scenarioId: scenario.id,
		scenarioName: scenario.name,
		projectId: scenario.projectId,
		tunnelId: scenario.tunnelId,
		environmentId: env.id,
		environmentLabel: env.label,
		status: "failed",
		durationMs,
		startedAt,
		steps: [{ index: 0, title: "Préparation du run mobile", status: "failed", durationMs, error }],
	};
}

function persist(
	scenario: Scenario,
	report: Report,
	startedAt: string,
	onEvent: (e: RunEvent) => void,
): RunResult {
	saveReport(report);
	updateLastRun(scenario.projectId, scenario.tunnelId, scenario.id, {
		status: report.status === "passed" ? "passed" : "failed",
		at: startedAt,
		durationMs: report.durationMs,
		stepCount: report.steps.length,
	});
	onEvent({
		type: "run-finished",
		status: report.status,
		durationMs: report.durationMs,
	});
	return {
		runId: report.runId,
		status: report.status,
		durationMs: report.durationMs,
		report,
	};
}

export const maestroRunner: TestRunner = {
	async run(
		scenario: Scenario,
		env: Environment,
		onEvent: (e: RunEvent) => void,
		opts?: RunOptions,
	): Promise<RunResult> {
		const runId = randomUUID();
		const startedAt = new Date().toISOString();
		const beginMs = Date.now();
		const runDir = join(getWorkspaceDir(), "runs", runId);
		mkdirSync(runDir, { recursive: true });

		// Garde-fous → rapports d'échec mappés (jamais d'exception).
		if (!env.app?.appId) {
			const report = failedReport(runId, scenario, env, startedAt, 0,
				"Aucune application mobile configurée pour cet environnement.");
			onEvent({ type: "run-started", runId, totalSteps: 1, steps: [report.steps[0].title] });
			return persist(scenario, report, startedAt, onEvent);
		}
		if (env.app.source === "firebase") {
			const report = failedReport(runId, scenario, env, startedAt, 0,
				"Récupération du build via Firebase App Distribution : disponible en Phase 4.");
			onEvent({ type: "run-started", runId, totalSteps: 1, steps: [report.steps[0].title] });
			return persist(scenario, report, startedAt, onEvent);
		}
		const deviceId = opts?.deviceId;
		if (!deviceId) {
			const report = failedReport(runId, scenario, env, startedAt, 0,
				"Aucun appareil sélectionné — branche un téléphone ou démarre un émulateur.");
			onEvent({ type: "run-started", runId, totalSteps: 1, steps: [report.steps[0].title] });
			return persist(scenario, report, startedAt, onEvent);
		}

		// Flow effectif : rebase l'appId d'en-tête vers l'app de l'env de run.
		const scenarioDir = join(getWorkspaceDir(), "projects", scenario.projectId,
			"tunnels", scenario.tunnelId, "scenarios", scenario.id);
		const rawFlow = readFileSync(join(scenarioDir, scenario.specFile), "utf-8");
		const flow = rebaseFlowAppId(rawFlow, env.app.appId);
		const flowPath = join(runDir, scenario.specFile);
		writeFileSync(flowPath, flow, "utf-8");
		const junitPath = join(runDir, "report.xml");

		const planTitles = parseFlowSteps(flow).map((s) => s.title);
		onEvent({ type: "run-started", runId, totalSteps: planTitles.length, steps: planTitles });

		// Spawn maestro (injectable via OTL_MAESTRO_BIN[_ARGS], cf. OTL_CODEGEN).
		const bin = toolBin("maestro");
		const prefixArgs = process.env.OTL_MAESTRO_BIN_ARGS
			? [process.env.OTL_MAESTRO_BIN_ARGS]
			: [];
		const args = [
			...prefixArgs,
			"--device", deviceId,
			"test",
			"--format", "junit",
			"--output", junitPath,
			"--debug-output", runDir,
			flowPath,
		];

		let stdout = "";
		const child = spawn(bin, args, { env: process.env, shell: isWindows });
		const state: RunState = { child, cancelled: false };
		activeRuns.set(runId, state);

		child.stdout?.on("data", (b: Buffer) => {
			const s = b.toString();
			stdout += s;
			for (const line of s.split("\n")) if (line.trim()) onEvent({ type: "log", line });
		});
		child.stderr?.on("data", (b: Buffer) => {
			const s = b.toString();
			stdout += s;
			for (const line of s.split("\n")) if (line.trim()) onEvent({ type: "log", line });
		});

		return new Promise<RunResult>((resolve) => {
			let settled = false;
			const finish = (report: Report) => {
				if (settled) return;
				settled = true;
				activeRuns.delete(runId);
				if (state.cancelled) report.status = "cancelled";
				report.batchId = opts?.batchId;
				// Émet les événements par étape depuis le rapport construit.
				for (const step of report.steps) {
					if (step.status === "skipped") {
						onEvent({ type: "step-skipped", index: step.index, title: step.title });
						continue;
					}
					onEvent({ type: "step-started", index: step.index, title: step.title });
					if (step.status === "failed")
						onEvent({ type: "step-failed", index: step.index, error: step.error ?? "Échec" });
					else
						onEvent({ type: "step-passed", index: step.index, durationMs: step.durationMs });
				}
				resolve(persist(scenario, report, startedAt, onEvent));
			};

			child.on("error", () => {
				finish(failedReport(runId, scenario, env, startedAt, Date.now() - beginMs,
					"Impossible de démarrer Maestro (commande introuvable)."));
			});
			child.on("close", () => {
				const durationMs = Date.now() - beginMs;
				let junitXml = "";
				try {
					junitXml = readFileSync(junitPath, "utf-8");
				} catch {
					/* pas de rapport → JUnit vide = échec mappé par le mapper */
				}
				const report = buildMaestroReport(
					{
						runId,
						scenarioId: scenario.id,
						scenarioName: scenario.name,
						projectId: scenario.projectId,
						tunnelId: scenario.tunnelId,
						environmentId: env.id,
						environmentLabel: env.label,
						startedAt,
						durationMs,
						planTitles,
					},
					stdout,
					junitXml,
				);
				finish(report);
			});
		});
	},

	async cancel(runId: string): Promise<void> {
		const state = activeRuns.get(runId);
		if (!state) return;
		state.cancelled = true;
		const pid = state.child.pid;
		if (pid === undefined) return;
		if (isWindows) spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
		else {
			try {
				process.kill(-pid, "SIGKILL");
			} catch {
				try {
					state.child.kill("SIGKILL");
				} catch {
					/* déjà mort */
				}
			}
		}
	},
};
```

> Note : `finish()` ré-émet les événements par étape depuis le rapport (le stdout Maestro n'est pas un protocole live stable). Le rapport reste la source de vérité — comme le chemin de repli du runner web.

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/maestroRunner.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/runner/maestroRunner.ts tests/fixtures/fake-maestro.mjs tests/main/maestroRunner.test.ts
git commit -m "feat(mobile) — maestroRunner: exécute un flow sur appareil + rapport (TestRunner)"
```

---

### Task 3: Dispatch par plateforme (`handleRunScenario` + `run:cancel`)

**Files:**
- Modify: `src/main/ipc/handlers.ts` (import `maestroRunner` + sélection du runner)
- Modify: `src/main/ipc/register.ts` (`run:cancel` cible les deux runners)
- Test: `tests/main/runDispatch.test.ts`

**Interfaces:**
- Consumes: `playwrightRunner`, `maestroRunner` (tous deux `TestRunner`).
- Produces: comportement — `handleRunScenario` choisit `maestroRunner` si `scenario.platform === "mobile"`, sinon `playwrightRunner`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/main/runDispatch.test.ts` :

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRunScenario } from "../../src/main/ipc/handlers";
import * as projectStore from "../../src/main/stores/projectStore";
import * as scenarioStore from "../../src/main/stores/scenarioStore";
import type { Project, RunEvent, Scenario } from "../../src/shared/types";

const FAKE = resolve(process.cwd(), "tests/fixtures/fake-maestro.mjs");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-disp-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_MAESTRO_BIN = process.execPath;
	process.env.OTL_MAESTRO_BIN_ARGS = FAKE;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_MAESTRO_BIN", "OTL_MAESTRO_BIN_ARGS"])
		Reflect.deleteProperty(process.env, k);
});

describe("handleRunScenario — dispatch par plateforme", () => {
	it("un scénario mobile passe par maestroRunner (rapport produit via la fausse CLI)", async () => {
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
		const scenario: Scenario = {
			id: "parcours",
			projectId: "p1",
			tunnelId: "general",
			name: "Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "parcours.flow.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		};
		const sdir = join(dir, "projects", "p1", "tunnels", "general", "scenarios", "parcours");
		mkdirSync(sdir, { recursive: true });
		writeFileSync(join(sdir, "parcours.flow.yaml"), "appId: x\n---\n- launchApp\n");
		scenarioStore.saveScenario(scenario, "appId: x\n---\n- launchApp\n");

		const events: RunEvent[] = [];
		const { runId } = await handleRunScenario(
			"p1",
			"general",
			"parcours",
			"preprod",
			(_ch, ev) => events.push(ev),
			{ deviceId: "emulator-5554" },
		);
		expect(runId).toBeTruthy();
		// laisse le run se terminer
		await new Promise((r) => setTimeout(r, 200));
		expect(events.some((e) => e.type === "run-finished")).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run tests/main/runDispatch.test.ts`
Expected: FAIL — un scénario mobile passe encore par `playwrightRunner` (pas de rapport mobile / timeout).

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/main/ipc/handlers.ts`, ajouter l'import près de l'import existant de `playwrightRunner` :

```ts
import { maestroRunner } from "../runner/maestroRunner";
```

Puis, dans `handleRunScenario`, remplacer `void playwrightRunner.run(` par un choix de runner :

```ts
	const runner = scenario.platform === "mobile" ? maestroRunner : playwrightRunner;
	const ready = new Promise<{ runId: string; steps?: string[] }>((resolve) => {
		void runner.run(
```

(le reste du corps est inchangé).

Dans `src/main/ipc/register.ts`, ajouter l'import :

```ts
import { maestroRunner } from "../runner/maestroRunner";
```

et remplacer le handler `run:cancel` par un appel aux deux runners (un runId inconnu est un no-op sûr) :

```ts
	ipcMain.handle("run:cancel", async (_e, runId: string) => {
		await playwrightRunner.cancel(runId);
		await maestroRunner.cancel(runId);
	});
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run tests/main/runDispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Suite complète + lint + tsc**

Run: `npm test`
Expected: PASS (toute la suite).

Run: `npm run lint`
Expected: aucune erreur.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "maestro|handlers.ts|register.ts" || echo "mes fichiers OK"`
Expected: `mes fichiers OK`.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/handlers.ts src/main/ipc/register.ts tests/main/runDispatch.test.ts
git commit -m "feat(mobile) — dispatch: handleRunScenario choisit le runner par plateforme + cancel"
```

---

## Clôture de la Phase 3 (= ouverture de la PR)

- [ ] **Pousser + PR**

```bash
git push -u origin feat/maestro-phase3-runner
gh pr create --title "feat(mobile) — Phase 3 : maestroRunner + report mapper + dispatch" \
  --body "Phase 3/6. maestroRunner implémente TestRunner (exécute un flow Maestro sur un appareil Android, mappe JUnit+stdout → Report/RunEvent comme le web). Dispatch par plateforme dans handleRunScenario ; cancel sur les deux runners. Source 'installed' uniquement (Firebase = Phase 4). Testé sans appareil réel via une fausse CLI maestro. Spec : docs/superpowers/specs/2026-06-26-maestro-mobile-testing-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Critère de done** : CI verte (3 OS + E2E).

## Couverture du spec (auto-revue)

- §7 exécuter un flow sur appareil (`maestro --device test --format junit --debug-output`) → Task 2. ✅
- §7 rebase appId au lancement → Task 2 (`rebaseFlowAppId`). ✅
- §7 rapport via JUnit + stdout, mêmes `Report`/`RunEvent` → Tasks 1 & 2. ✅
- §7 dispatch par plateforme + cancel → Task 3. ✅
- §7 `ensureAppOnDevice` (Firebase pull/install) → **Phase 4** (ici : `installed` no-op, `firebase` → erreur mappée). ✅ (renvoi explicite)
- §7 screenshot d'échec via `adb exec-out screencap` → différé Phase 4/5 (le mapper porte déjà `error` ; pas de PNG en Phase 3). Noté.
- §9 testable sans appareil (fake-maestro, stores temp) → Tasks 2 & 3. ✅
