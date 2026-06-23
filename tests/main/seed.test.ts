import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedIfEmpty } from "../../src/main/seed";
import { listEnvironments } from "../../src/main/stores/environmentStore";
import { listScenarios } from "../../src/main/stores/scenarioStore";

// The repo root contains fixtures/seed-scenarios and fixtures/site
const REPO_ROOT = join(import.meta.dirname, "../..");
const FIXTURES_ROOT = join(REPO_ROOT, "fixtures");

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-seed-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_FIXTURES");
});

describe("seedIfEmpty", () => {
	it("seeds scenario named 'Parcours d'accueil'", () => {
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenarios();
		expect(scenarios.some((s) => s.name === "Parcours d'accueil")).toBe(true);
	});

	it("seeds a 'local' environment with a file:// baseURL", () => {
		seedIfEmpty(REPO_ROOT);
		const envs = listEnvironments();
		const local = envs.find((e) => e.id === "local");
		expect(local).toBeDefined();
		expect(local?.baseURL).toMatch(/^file:\/\//);
		expect(local?.baseURL).toContain("index.html");
	});

	it("is idempotent — calling twice still yields exactly one 'Parcours d'accueil' scenario", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenarios().filter(
			(s) => s.name === "Parcours d'accueil",
		);
		expect(scenarios).toHaveLength(1);
	});

	it("is idempotent — calling twice still yields exactly one 'local' environment", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const locals = listEnvironments().filter((e) => e.id === "local");
		expect(locals).toHaveLength(1);
	});

	it("does not overwrite existing scenarios when not empty", () => {
		// Pre-seed a scenario to simulate non-empty workspace
		seedIfEmpty(REPO_ROOT);
		const afterFirst = listScenarios().length;
		// Call again — should remain same count
		seedIfEmpty(REPO_ROOT);
		expect(listScenarios()).toHaveLength(afterFirst);
	});

	it("OTL_FIXTURES override: seeds scenario when OTL_FIXTURES points at repo fixtures/", () => {
		process.env.OTL_FIXTURES = FIXTURES_ROOT;
		// Pass an invalid appRoot — the override must take precedence
		seedIfEmpty("/nonexistent/approot");
		const scenarios = listScenarios();
		expect(scenarios.some((s) => s.name === "Parcours d'accueil")).toBe(true);
	});

	it("OTL_FIXTURES override: seeds 'local' environment with file:// baseURL", () => {
		process.env.OTL_FIXTURES = FIXTURES_ROOT;
		seedIfEmpty("/nonexistent/approot");
		const envs = listEnvironments();
		const local = envs.find((e) => e.id === "local");
		expect(local).toBeDefined();
		expect(local?.baseURL).toMatch(/^file:\/\//);
		expect(local?.baseURL).toContain("index.html");
	});
});
