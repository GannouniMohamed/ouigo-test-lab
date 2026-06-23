import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRunner } from "../../src/main/runner/playwrightRunner";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Environment, RunEvent, Scenario } from "../../src/shared/types";

const REPO = resolve(__dirname, "../..");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-cancel-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_RUNNER_CONFIG = join(REPO, "playwright.runner.config.ts");
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_RUNNER_CONFIG");
});

const longSpec = `import { test } from "@playwright/test";
test("long", async ({ page }) => {
  await page.waitForTimeout(30000);
});`;

const scenario: Scenario = {
	id: "long",
	name: "Long",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "local",
	tags: [],
	specFile: "long.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

describe("cancel", () => {
	it("annule un run en cours → status cancelled", async () => {
		saveScenario(scenario, longSpec);
		const env: Environment = {
			id: "local",
			label: "Local",
			baseURL: pathToFileURL(join(REPO, "fixtures/site/index.html")).href,
			variables: {},
		};

		let runId = "";
		const events: RunEvent[] = [];
		const runPromise = playwrightRunner.run(scenario, env, (e) => {
			events.push(e);
			if (e.type === "run-started") runId = e.runId;
		});

		// wait until the run actually started
		const start = Date.now();
		while (!runId && Date.now() - start < 20000) {
			await new Promise((r) => setTimeout(r, 100));
		}
		expect(runId).not.toBe("");

		// give Playwright a moment to spawn workers, then cancel
		await new Promise((r) => setTimeout(r, 1500));
		await playwrightRunner.cancel(runId);

		const res = await runPromise;
		expect(res.status).toBe("cancelled");
		expect(events.find((e) => e.type === "run-finished")?.status).toBe(
			"cancelled",
		);
	}, 60000);
});
