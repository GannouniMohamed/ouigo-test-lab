import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedIfEmpty } from "../../src/main/seed";
import {
	getProject,
	listEnvironments,
	listProjects,
	saveProject,
} from "../../src/main/stores/projectStore";
import { listScenariosByProject } from "../../src/main/stores/scenarioStore";

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
	it("crée le projet par défaut et le tunnel Général", () => {
		seedIfEmpty(REPO_ROOT);
		expect(listProjects().map((p) => p.id)).toContain("default");
	});
	it("seeds scenario named 'Parcours d'accueil'", () => {
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenariosByProject("default");
		expect(scenarios.some((s) => s.name === "Parcours d'accueil")).toBe(true);
	});
	it("seeds a 'local' environment with a file:// baseURL", () => {
		seedIfEmpty(REPO_ROOT);
		const local = listEnvironments("default").find((e) => e.id === "local");
		expect(local).toBeDefined();
		expect(local?.baseURL).toMatch(/^file:\/\//);
		expect(local?.baseURL).toContain("index.html");
	});
	it("is idempotent — exactly one 'Parcours d'accueil' scenario", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const scenarios = listScenariosByProject("default").filter(
			(s) => s.name === "Parcours d'accueil",
		);
		expect(scenarios).toHaveLength(1);
	});
	it("is idempotent — exactly one 'local' environment", () => {
		seedIfEmpty(REPO_ROOT);
		seedIfEmpty(REPO_ROOT);
		const locals = listEnvironments("default").filter((e) => e.id === "local");
		expect(locals).toHaveLength(1);
	});
	it("does not overwrite existing scenarios when not empty", () => {
		seedIfEmpty(REPO_ROOT);
		const afterFirst = listScenariosByProject("default").length;
		seedIfEmpty(REPO_ROOT);
		expect(listScenariosByProject("default")).toHaveLength(afterFirst);
	});
	it("seeds default project's environments include preprod", () => {
		seedIfEmpty(REPO_ROOT);
		expect(getProject("default").environments.map((e) => e.id)).toContain(
			"preprod",
		);
	});
	it("OTL_FIXTURES override seeds the scenario", () => {
		process.env.OTL_FIXTURES = FIXTURES_ROOT;
		seedIfEmpty("/nonexistent/approot");
		expect(
			listScenariosByProject("default").some(
				(s) => s.name === "Parcours d'accueil",
			),
		).toBe(true);
	});
	it("ne plante pas si des projets existent mais pas le projet par défaut", () => {
		saveProject({
			id: "autre",
			name: "Autre",
			description: "",
			environments: [
				{ id: "x", label: "X", baseURL: "https://x", variables: {} },
			],
			createdAt: "2026-06-24T00:00:00Z",
		});
		expect(() => seedIfEmpty(REPO_ROOT)).not.toThrow();
	});
});
