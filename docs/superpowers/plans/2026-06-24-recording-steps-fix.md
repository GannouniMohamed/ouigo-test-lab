# Fix — Scénarios enregistrés « sans étapes » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make recorded scenarios show their real steps (the `page.*()`/`expect()` actions) in the Report, Live Run, and the Hub step count, and stop losing the last recorded action on recording stop.

**Architecture:** A custom Playwright reporter captures `pw:api`+`expect` steps (which the default JSON reporter drops) and writes them to `OTL_STEPS_OUT`; the runner overrides `report.steps` with those. The recorder stops codegen gracefully (waits for the throttled flush) before reading the spec.

**Tech Stack:** TypeScript main process, Playwright test runner, Vitest, Playwright `_electron` E2E, Biome.

## Global Constraints
- **Root cause (confirmed):** Playwright's JSON reporter emits `result.steps: []` for flat `page.*`/`expect()` specs (codegen output) → 0 steps. A custom reporter's `onStepEnd` DOES see them (categories `pw:api`, `expect`).
- The runner emits all `report.steps` in one burst at `child.close` (no live streaming), so fixing `report.steps` fixes Report + Live Run + `lastRun.stepCount` together.
- **Step filter:** keep `category === "expect"` OR (`category === "pw:api"` AND title does NOT start with `"browser"`). Exclude `hook`/`fixture`. Excludes `browserType.launch`/`browser.newContext`/`browserContext.newPage`; keeps `page.*`/`locator.*`/`expect.*`.
- Custom-steps consumption must be **backward-compatible**: if `OTL_STEPS_OUT` is missing/unreadable, keep the current mapper behavior.
- Biome tabs/LF. Run `npx @biomejs/biome check .` (whole tree) before each commit.
- The reporter is a **CommonJS `.cjs`** file at repo root (next to `playwright.runner.config.ts`), referenced **relative to the config** so the `OTL_RUNNER_CONFIG` test override works.
- `new Date().toISOString()` allowed in main. Run unit tests with `npx vitest run <file>`.
- E2E `.spec.ts`, gated on `toBeVisible`, no `waitForTimeout`.

---

### Task 1: Custom step reporter + wire into the runner config

**Files:**
- Create: `playwright.step-reporter.cjs` (repo root)
- Modify: `playwright.runner.config.ts` (add the reporter)
- Test: `tests/main/stepReporter.test.ts` (new — run a real spec, assert the steps file)

**Interfaces:**
- Produces: a reporter that writes a JSON array to `process.env.OTL_STEPS_OUT` on `onEnd`. Each entry: `{ title: string; durationMs: number; status: "passed"|"failed"; error?: string }`.

- [ ] **Step 1: Write the reporter**

Create `playwright.step-reporter.cjs`:
```js
const fs = require("node:fs");

// Custom Playwright reporter: captures user-meaningful steps (page.* / locator.* /
// expect.*) that the built-in JSON reporter omits from result.steps, and writes
// them to OTL_STEPS_OUT so the runner can surface real steps for recorded specs.
class StepReporter {
	constructor() {
		this._steps = [];
	}
	onStepEnd(_test, _result, step) {
		const cat = step.category;
		const keep =
			cat === "expect" ||
			(cat === "pw:api" && !String(step.title).startsWith("browser"));
		if (!keep) return;
		this._steps.push({
			title: step.title,
			durationMs: typeof step.duration === "number" ? step.duration : 0,
			status: step.error ? "failed" : "passed",
			error: step.error ? step.error.message : undefined,
		});
	}
	onEnd() {
		const out = process.env.OTL_STEPS_OUT;
		if (!out) return;
		try {
			fs.writeFileSync(out, JSON.stringify(this._steps), "utf-8");
		} catch {
			/* ignore — runner falls back to the JSON report */
		}
	}
}

module.exports = StepReporter;
```

- [ ] **Step 2: Wire it into the runner config**

In `playwright.runner.config.ts`, add the reporter to the `reporter` array (after `json`):
```ts
	reporter: [
		["list"],
		["json", { outputFile: process.env.OTL_JSON_OUT || "pw.json" }],
		["./playwright.step-reporter.cjs"],
	],
```

- [ ] **Step 3: Write the test**

Create `tests/main/stepReporter.test.ts`. Write a temp spec that does multiple actions against a `data:` URL (no network), e.g.:
```ts
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "otl-steps-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it("le reporter custom capte les étapes page.*/expect et exclut l'infra", () => {
	writeFileSync(
		join(dir, "s.spec.ts"),
		[
			'import { expect, test } from "@playwright/test";',
			'test("p", async ({ page }) => {',
			'  await page.goto("data:text/html,<h1>Bonjour</h1>");',
			'  await expect(page.locator("h1")).toHaveText("Bonjour");',
			'  await page.goto("data:text/html,<h1>Bonjour</h1>");',
			"});",
		].join("\n"),
		"utf-8",
	);
	const stepsOut = join(dir, "steps.json");
	execFileSync(
		process.platform === "win32" ? "npx.cmd" : "npx",
		["playwright", "test", "--config", join(REPO, "playwright.runner.config.ts")],
		{
			cwd: REPO,
			env: {
				...process.env,
				OTL_TEST_DIR: dir,
				OTL_JSON_OUT: join(dir, "pw.json"),
				OTL_STEPS_OUT: stepsOut,
				OTL_ARTIFACTS: join(dir, "art"),
				NODE_PATH: join(REPO, "node_modules"),
			},
			stdio: "pipe",
		},
	);
	expect(existsSync(stepsOut)).toBe(true);
	const steps = JSON.parse(readFileSync(stepsOut, "utf-8")) as Array<{
		title: string;
		status: string;
	}>;
	const titles = steps.map((s) => s.title);
	// page.goto x2 + expect.toHaveText, no browser*/hook/fixture
	expect(titles.some((t) => t.startsWith("page.goto"))).toBe(true);
	expect(titles.some((t) => t.startsWith("expect"))).toBe(true);
	expect(titles.some((t) => t.startsWith("browser"))).toBe(false);
	expect(steps.length).toBeGreaterThanOrEqual(3);
	expect(steps.every((s) => s.status === "passed")).toBe(true);
});
```
(This test launches a real headless chromium via the runner config. It may be slower; that's acceptable for one test. If `data:` navigations aren't recorded as `page.goto` steps, adjust the assertion to match the real titles seen — but `page.goto` should appear.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/main/stepReporter.test.ts`
Expected: PASS — steps file contains the page/expect steps, excludes infra.

- [ ] **Step 5: Lint + commit**

```bash
npx @biomejs/biome check .
git add playwright.step-reporter.cjs playwright.runner.config.ts tests/main/stepReporter.test.ts
git commit -m "feat(fix1): custom Playwright step reporter (pw:api + expect) → OTL_STEPS_OUT"
```

---

### Task 2: Runner consumes OTL_STEPS_OUT → real report.steps

**Files:**
- Modify: `src/main/runner/playwrightRunner.ts` (set `OTL_STEPS_OUT`; after run, override `report.steps` from the steps file)
- Test: `tests/main/runnerSteps.test.ts` (new) OR extend an existing runner test

**Interfaces:**
- Consumes: the steps file written by Task 1's reporter.
- Produces: when `steps.json` exists, `report.steps` reflects those steps (sequential index); `lastRun.stepCount` equals their count. When absent, unchanged behavior.

- [ ] **Step 1: Set OTL_STEPS_OUT in childEnv**

In `playwrightRunner.run`, add a steps path and env var:
```ts
const stepsOut = join(runDir, "steps.json");
```
Add to `childEnv`: `OTL_STEPS_OUT: stepsOut,`.

- [ ] **Step 2: Add a helper that reads + maps the custom steps**

In `playwrightRunner.ts`, add (near the top-level helpers):
```ts
import { existsSync } from "node:fs";
import type { ReportStep, StepStatus } from "../../shared/types";

function readCustomSteps(stepsOut: string): ReportStep[] | null {
	if (!existsSync(stepsOut)) return null;
	try {
		const raw = JSON.parse(readFileSync(stepsOut, "utf-8")) as Array<{
			title: string;
			durationMs?: number;
			status?: string;
			error?: string;
		}>;
		if (!Array.isArray(raw)) return null;
		return raw.map((s, index) => {
			const step: ReportStep = {
				index,
				title: s.title,
				status: (s.status === "failed" ? "failed" : "passed") as StepStatus,
				durationMs: typeof s.durationMs === "number" ? s.durationMs : 0,
			};
			if (s.error) step.error = s.error;
			return step;
		});
	} catch {
		return null;
	}
}
```
(Reuse the existing `readFileSync` import; add `existsSync` to the `node:fs` import.)

- [ ] **Step 3: Override report.steps where the JSON report is mapped**

Find where the runner reads `playwright.json` and calls `mapPlaywrightReport(...)` (in the `child.close` handler). After producing `report`, override its steps when custom steps are present:
```ts
const customSteps = readCustomSteps(stepsOut);
if (customSteps && customSteps.length > 0) {
	report.steps = customSteps;
}
```
(Place this BEFORE `finishWith(report, true)` so the burst-emitted step events and `lastRun.stepCount` use the real steps. Do NOT override when `customSteps` is null or empty — preserves the failed-process/zero-step fallback.)

- [ ] **Step 4: Write the test**

Create `tests/main/runnerSteps.test.ts`. Read an existing runner test (e.g. how `tests/main` drives `playwrightRunner.run` with `OTL_RUNNER_CONFIG`/fixtures) and mirror it. Drive a run of a recorded-style spec (multi-action) and assert the resolved `RunResult.report.steps.length >= 2` and titles include a `page.goto`. If a full real run is already covered by an integration test, instead unit-test `readCustomSteps` directly: write a `steps.json`, call the helper (export it), assert the mapped `ReportStep[]` (indices sequential, statuses, error mapping). Prefer the direct `readCustomSteps` unit test for speed + determinism, plus assert the override logic (custom non-empty replaces; null/empty keeps).

- [ ] **Step 5: Run the test + main suite**

Run: `npx vitest run tests/main`
Expected: PASS (new test + no regression; existing runner tests still pass — when no `OTL_STEPS_OUT` file is produced they keep mapping the JSON).

- [ ] **Step 6: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/main/runner/playwrightRunner.ts tests/main/runnerSteps.test.ts
git commit -m "feat(fix2): runner overrides report.steps from OTL_STEPS_OUT (real recorded steps)"
```

---

### Task 3: Graceful codegen stop — don't lose the last action

**Files:**
- Modify: `src/main/recorder/playwrightRecorder.ts` (`stopRecording`)
- Test: `tests/main/recorderStop.test.ts` (new) OR extend `tests/main/playwrightRecorder.test.ts`

**Interfaces:**
- Produces: `stopRecording` waits for the codegen throttle flush before reading the spec, so the last recorded action is persisted.

- [ ] **Step 1: Implement graceful stop**

In `src/main/recorder/playwrightRecorder.ts` `stopRecording`, today it: polls for `existsSync(outFile)`, then `killProcessTree(session.child)`, then `readFileSync(outFile)`. Change the stop sequence so the throttled flush lands before reading:
1. Keep the existing 10s existence-wait loop.
2. Once the file exists, attempt a graceful terminate first: send `SIGTERM` to the process group (gives codegen a chance to flush on `BeforeClose`/`exit`). On Windows keep using `taskkill` (no graceful SIGTERM semantics — fall through to the wait + read).
3. Wait for the child to exit (`session.child` `exit`/`close`) OR a bounded delay (~700ms, > the 250ms throttle) — whichever first. Implement a small helper:
```ts
function waitForExitOrTimeout(child: ChildProcess, ms: number): Promise<void> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve();
		};
		child.once("exit", finish);
		child.once("close", finish);
		setTimeout(finish, ms);
	});
}
```
4. THEN `readFileSync(outFile)`.
5. THEN `killProcessTree(session.child)` as a guarantee (idempotent if already exited).

Concretely, replace the current `killProcessTree(...)` + immediate read with:
```ts
// Graceful stop: let codegen flush its throttled output (BeforeClose/exit)
// before we read, so the last recorded action is not lost.
const pid = session.child.pid;
if (!isWindows && pid !== undefined) {
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		/* already gone */
	}
}
await waitForExitOrTimeout(session.child, 700);

const specContent = readFileSync(session.outFile, "utf-8");

// Guarantee cleanup of any survivor.
killProcessTree(session.child);
```
(Keep the rest — the `uniqueId`, scenario construction with `session.platform`, `saveScenario`, `activeRecordings.delete` — unchanged.)

- [ ] **Step 2: Write the test**

Create `tests/main/recorderStop.test.ts`. With the fake codegen, the spec is written synchronously at start, so the content is present regardless — that proves stop still returns the scenario but not the throttle timing. To test the **timing fix**, point `OTL_CODEGEN`/`OTL_CODEGEN_ARGS` at a NEW fixture that writes the spec only AFTER a short delay (e.g. 300ms), to simulate codegen's throttled write landing shortly after start:
  - Create `tests/fixtures/delayed-codegen.mjs` that, after `setTimeout(300)`, writes a spec with a recognizable action to the `-o` path, then stays alive.
  - The test: `startRecording` → immediately `stopRecording` → assert the returned scenario's spec file (read `scenario.specFile` in the workspace, or assert `stopRecording` resolved a scenario and the saved spec contains the action). Because `stopRecording` now waits ~700ms, the 300ms-delayed write lands and is read. (Before the fix, an immediate SIGKILL+read could miss it.)
  - Mirror the workspace/seed setup of `tests/main/playwrightRecorder.test.ts`.

- [ ] **Step 3: Run the test + main suite**

Run: `npx vitest run tests/main/recorderStop.test.ts tests/main/playwrightRecorder.test.ts`
Expected: PASS. The existing recorder test (synchronous fake codegen) must still pass with the new graceful stop.

- [ ] **Step 4: Lint + commit**

```bash
npx @biomejs/biome check .
git add src/main/recorder/playwrightRecorder.ts tests/main/recorderStop.test.ts tests/fixtures/delayed-codegen.mjs
git commit -m "fix(fix3): graceful codegen stop — wait for throttle flush before reading the spec"
```

---

### Task 4: E2E proves steps appear + full-suite green

**Files:**
- Modify: `tests/e2e/recording.spec.ts` (assert the report shows ≥1 step)
- Test: whole suite + build + lint + all e2e

**Interfaces:**
- Consumes: fixes 1-3.

- [ ] **Step 1: Strengthen the recording e2e**

The fake-codegen spec does `page.goto` + `expect(...).toHaveText`. After fixes 1-2, the auto-run report should show real steps. In `tests/e2e/recording.spec.ts`, after landing on the report ("Réussi"), add an assertion that the step count is now > 0. Read the current report UI to find how steps/step-count render (e.g. the meta line "N étapes" or a steps list), and assert it shows a non-zero count (e.g. `await expect(win.getByText(/[1-9]\d* étapes?/)).toBeVisible({ timeout: 15000 })`, adjusting to the actual report markup). Keep AUTO badge + banner + "Réussi" assertions. No `waitForTimeout`.

- [ ] **Step 2: Run the whole suite**

Run:
```bash
npm test
npm run build
npx @biomejs/biome check .
npm run build && npx playwright test --config playwright.e2e.config.ts
```
Expected: all unit tests pass, build clean, lint clean, ALL e2e pass — including `recording.spec.ts` now asserting steps appear, and `happy-path`/`failure-path`/`projects`/`groups` unchanged.

- [ ] **Step 3: tsc honesty**

Run: `npx tsc --noEmit 2>&1 | grep -vE "LiveRun.tsx\(15[0-9]|appGate.test" | grep "error TS" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 4: Commit (if changes were needed)**

```bash
npx @biomejs/biome check .
git add tests/e2e/recording.spec.ts
git commit -m "test(fix4): e2e asserts recorded scenario shows real steps"
```

---

## Notes for the executor
- Each task is additive and leaves the repo green. Stack on `fix/recording-steps`, then one PR → `main`, watch CI per-job, merge `--squash --delete-branch` (NO `--auto`, per `ci-merge-gate`).
- After the tasks: whole-branch review (opus), consolidated fix wave if needed, PR + CI watch + merge, then a real-app demo (record → auto-run → report WITH steps) shared with the user.
- MERGE_BASE = current `main` HEAD (Phase C merged, 9f31f8e) — recorded before Task 1.
