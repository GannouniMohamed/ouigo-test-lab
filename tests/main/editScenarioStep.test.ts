import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleGetScenarioSpec,
	handleSaveScenarioSpec,
} from "../../src/main/ipc/handlers";
import { getScenario, saveScenario } from "../../src/main/stores/scenarioStore";
import { setStepScope } from "../../src/shared/spec";
import type { Scenario } from "../../src/shared/types";

let dir: string;

const SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://x');
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await page.getByLabel('Accepter').click();
  await page.getByTestId('submit').click();
});
`;

function seed(): void {
	const scenario: Scenario = {
		id: "s1",
		projectId: "p",
		tunnelId: "t",
		name: "S1",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "e",
		tags: [],
		specFile: "s1.spec.ts",
		createdAt: "2026-06-24T00:00:00Z",
		recordedStepCount: 4,
		lastRun: { status: "never" },
	};
	saveScenario(scenario, SPEC);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-editstep-"));
	process.env.OTL_WORKSPACE = dir;
	seed();
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("scenario spec IPC (draft model)", () => {
	it("getScenarioSpec returns the stored spec", () => {
		expect(handleGetScenarioSpec("p", "t", "s1")).toContain("await page.goto");
	});

	it("saveScenarioSpec persists a draft and recomputes the step count", () => {
		// Draft: scope step 1 to visible-only (the user's per-mode 'Ignorer').
		const draft = setStepScope(SPEC, 1, "visible");
		const steps = handleSaveScenarioSpec("p", "t", "s1", draft);

		expect(steps).toHaveLength(4);
		expect(steps[1].scope).toBe("visible");
		// Persisted to disk
		expect(handleGetScenarioSpec("p", "t", "s1")).toContain("// [otl:visible]");
		expect(getScenario("p", "t", "s1").recordedStepCount).toBe(4);
	});

	it("saving a draft with a deleted step lowers the count", () => {
		const draft = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://x');
  await page.getByTestId('submit').click();
});
`;
		const steps = handleSaveScenarioSpec("p", "t", "s1", draft);
		expect(steps).toHaveLength(2);
		expect(getScenario("p", "t", "s1").recordedStepCount).toBe(2);
	});
});
