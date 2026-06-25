import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRunner } from "../../src/main/runner/playwrightRunner";
import { getReport } from "../../src/main/stores/reportStore";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Environment, RunEvent, Scenario } from "../../src/shared/types";

let dir: string;
const REPO = resolve(__dirname, "../..");

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-run-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_RUNNER_CONFIG = join(REPO, "playwright.runner.config.ts");
	// The runner is headed by default (so Didomi & co render); force headless
	// here so this integration test runs on display-less CI (e.g. Ubuntu).
	process.env.OTL_FORCE_HEADLESS = "1";
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_RUNNER_CONFIG");
	Reflect.deleteProperty(process.env, "OTL_FORCE_HEADLESS");
});

const scenario: Scenario = {
	id: "passing",
	projectId: "default",
	tunnelId: "general",
	name: "Parcours d'accueil",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "local",
	tags: ["smoke"],
	specFile: "passing.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

describe("playwrightRunner", () => {
	it("exécute un scénario passant et émet run-finished=passed", async () => {
		const specContent = readFileSync(
			join(REPO, "fixtures/seed-scenarios/passing/passing.spec.ts"),
			"utf-8",
		);
		saveScenario(scenario, specContent);
		const siteUrl = pathToFileURL(join(REPO, "fixtures/site/index.html")).href;
		const env: Environment = {
			id: "local",
			label: "Local",
			baseURL: siteUrl,
			variables: {},
		};

		const events: RunEvent[] = [];
		const res = await playwrightRunner.run(scenario, env, (e) =>
			events.push(e),
		);

		expect(res.status).toBe("passed");
		expect(events.find((e) => e.type === "run-started")).toBeTruthy();
		expect(events.find((e) => e.type === "run-finished")?.status).toBe(
			"passed",
		);
		// report persisté
		expect(getReport(res.runId).status).toBe("passed");
	}, 120_000);

	it("estampille le batchId fourni dans les options sur le rapport persisté", async () => {
		const specContent = readFileSync(
			join(REPO, "fixtures/seed-scenarios/passing/passing.spec.ts"),
			"utf-8",
		);
		saveScenario(scenario, specContent);
		const siteUrl = pathToFileURL(join(REPO, "fixtures/site/index.html")).href;
		const env: Environment = {
			id: "local",
			label: "Local",
			baseURL: siteUrl,
			variables: {},
		};

		const res = await playwrightRunner.run(scenario, env, () => {}, {
			batchId: "batch-xyz",
		});

		expect(getReport(res.runId).batchId).toBe("batch-xyz");
	}, 120_000);
});
