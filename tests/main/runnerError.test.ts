import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRunner } from "../../src/main/runner/playwrightRunner";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Environment, Scenario } from "../../src/shared/types";

const REPO = resolve(__dirname, "../..");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-err-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_RUNNER_CONFIG = join(REPO, "playwright.runner.config.ts");
	process.env.OTL_NPX = "otl-nonexistent-binary-zzz";
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_RUNNER_CONFIG");
	Reflect.deleteProperty(process.env, "OTL_NPX");
});

const scenario: Scenario = {
	id: "x",
	projectId: "default",
	tunnelId: "general",
	name: "X",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "local",
	tags: [],
	specFile: "x.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

describe("runner error handling", () => {
	it("résout en failed (sans hang) si la commande est introuvable", async () => {
		saveScenario(
			scenario,
			'import { test } from "@playwright/test"; test("x", async () => {});',
		);
		const env: Environment = {
			id: "local",
			label: "Local",
			baseURL: pathToFileURL(join(REPO, "fixtures/site/index.html")).href,
			variables: {},
		};
		const res = await playwrightRunner.run(scenario, env, () => {});
		expect(res.status).toBe("failed");
	}, 15000);
});
