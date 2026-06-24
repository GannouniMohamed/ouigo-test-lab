import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleCreateProject,
	handleCreateTunnel,
	handleDeleteScenario,
	handleGetReport,
	handleListProjects,
	handleListReports,
	handleListScenariosByProject,
	handleListTunnels,
	handleRunScenario,
} from "../../src/main/ipc/handlers";
import { playwrightRunner } from "../../src/main/runner/playwrightRunner";
import { saveProject } from "../../src/main/stores/projectStore";
import { saveReport } from "../../src/main/stores/reportStore";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";
import type { Report, Scenario } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-handlers-"));
	process.env.OTL_WORKSPACE = dir;
	// Seed a default project with a general tunnel
	saveProject({
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://preprod.ouigo.example",
				variables: {},
			},
			{
				id: "recette",
				label: "Recette",
				baseURL: "https://recette.ouigo.example",
				variables: {},
			},
		],
		createdAt: "2026-06-24T00:00:00Z",
	});
	saveTunnel({
		id: "general",
		projectId: "default",
		name: "Général",
		order: 0,
		createdAt: "2026-06-24T00:00:00Z",
	});
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

const sample: Scenario = {
	id: "login",
	projectId: "default",
	tunnelId: "general",
	name: "Connexion",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "preprod",
	tags: ["auth"],
	specFile: "login.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

describe("handlers", () => {
	describe("handleListScenariosByProject", () => {
		it("returns seeded scenario", () => {
			saveScenario(sample, 'test("ok", () => {});');
			const result = handleListScenariosByProject("default");
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Connexion");
		});

		it("returns empty array when no scenarios", () => {
			expect(handleListScenariosByProject("default")).toEqual([]);
		});
	});

	describe("handleDeleteScenario", () => {
		it("deletes a scenario", () => {
			saveScenario(sample, "x");
			handleDeleteScenario("default", "general", "login");
			expect(handleListScenariosByProject("default")).toHaveLength(0);
		});
	});

	describe("handleListReports", () => {
		it("returns empty array when no reports", () => {
			expect(handleListReports()).toEqual([]);
		});

		it("returns saved report summary", () => {
			const report: Report = {
				runId: "run-1",
				scenarioId: "login",
				scenarioName: "Connexion",
				environmentLabel: "Préprod",
				status: "passed",
				durationMs: 1000,
				startedAt: "2026-06-23T01:00:00Z",
				steps: [],
			};
			saveReport(report);
			const summaries = handleListReports();
			expect(summaries).toHaveLength(1);
			expect(summaries[0].runId).toBe("run-1");
		});

		it("filters reports by scenarioId", () => {
			const report1: Report = {
				runId: "run-1",
				scenarioId: "login",
				scenarioName: "Connexion",
				environmentLabel: "Préprod",
				status: "passed",
				durationMs: 1000,
				startedAt: "2026-06-23T01:00:00Z",
				steps: [],
			};
			const report2: Report = {
				runId: "run-2",
				scenarioId: "other",
				scenarioName: "Other",
				environmentLabel: "Préprod",
				status: "failed",
				durationMs: 500,
				startedAt: "2026-06-23T02:00:00Z",
				steps: [],
			};
			saveReport(report1);
			saveReport(report2);
			const summaries = handleListReports("login");
			expect(summaries).toHaveLength(1);
			expect(summaries[0].scenarioId).toBe("login");
		});
	});

	describe("handleGetReport", () => {
		it("returns report by runId", () => {
			const report: Report = {
				runId: "run-42",
				scenarioId: "login",
				scenarioName: "Connexion",
				environmentLabel: "Préprod",
				status: "passed",
				durationMs: 1500,
				startedAt: "2026-06-23T01:00:00Z",
				steps: [],
			};
			saveReport(report);
			const result = handleGetReport("run-42");
			expect(result.scenarioName).toBe("Connexion");
		});

		it("throws when report not found", () => {
			expect(() => handleGetReport("nonexistent")).toThrow("Report not found");
		});
	});

	it("handleCreateProject crée un projet avec tunnel Général et environnements", () => {
		const p = handleCreateProject({ name: "Site Web", description: "" });
		expect(p.name).toBe("Site Web");
		expect(p.environments.length).toBeGreaterThanOrEqual(2);
		expect(handleListTunnels(p.id).map((t) => t.id)).toEqual(["general"]);
		expect(handleListProjects().some((x) => x.id === p.id)).toBe(true);
	});

	it("handleCreateTunnel ajoute un tunnel ordonné", () => {
		const p = handleCreateProject({ name: "Site Web", description: "" });
		const t = handleCreateTunnel({ projectId: p.id, name: "Réservation" });
		expect(t.name).toBe("Réservation");
		expect(t.order).toBe(1);
		expect(handleListTunnels(p.id).map((t2) => t2.name)).toContain(
			"Réservation",
		);
	});

	it("handleCreateProject génère un id sain même si le nom slugifie en vide", () => {
		// slugify("!!!") returns "scenario" (its own fallback), so the handlers'
		// fallback ("projet") is exercised when base="" is passed directly. Here we
		// verify the public contract: a name made of only symbols produces an id
		// with no leading dash and non-zero length, regardless of which fallback
		// fires (slugify's "scenario" or handlers' "projet").
		const p = handleCreateProject({ name: "!!!", description: "" });
		expect(p.id).not.toMatch(/^-/);
		expect(p.id.length).toBeGreaterThan(0);
	});

	it("handleRunScenario résout le scénario et l'environnement scopés projet", async () => {
		// seed: project "default" with env "preprod" + tunnel "general" + scenario "login"
		saveProject({
			id: "default",
			name: "P",
			description: "",
			environments: [
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "https://pp",
					variables: {},
				},
			],
			createdAt: "2026-06-24T00:00:00Z",
		});
		saveTunnel({
			id: "general",
			projectId: "default",
			name: "Général",
			order: 0,
			createdAt: "2026-06-24T00:00:00Z",
		});
		saveScenario(
			{
				id: "login",
				projectId: "default",
				tunnelId: "general",
				name: "Connexion",
				platform: "web",
				browser: "chromium",
				defaultEnvironmentId: "preprod",
				tags: [],
				specFile: "login.spec.ts",
				createdAt: "2026-06-24T00:00:00Z",
				lastRun: { status: "never" },
			},
			'test("x", () => {});',
		);

		const spy = vi
			.spyOn(playwrightRunner, "run")
			.mockImplementation((_s, _e, cb) => {
				cb({ type: "run-started", runId: "run-1" });
				return Promise.resolve({
					runId: "run-1",
					status: "passed",
					durationMs: 1,
					report: {} as never,
				});
			});

		const res = await handleRunScenario(
			"default",
			"general",
			"login",
			"preprod",
			() => {},
		);
		expect(res.runId).toBe("run-1");
		const [passedScenario, passedEnv] = spy.mock.calls[0];
		expect(passedScenario.id).toBe("login");
		expect(passedEnv.id).toBe("preprod");
		spy.mockRestore();
	});
});
