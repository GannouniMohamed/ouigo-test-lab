import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleCreateProject,
	handleCreateTunnel,
	handleDeleteProject,
	handleDeleteScenario,
	handleGetReport,
	handleListProjects,
	handleListReports,
	handleListScenariosByProject,
	handleListTunnels,
	handleRunScenario,
	handleUpdateTunnel,
} from "../../src/main/ipc/handlers";
import { playwrightRunner } from "../../src/main/runner/playwrightRunner";
import { saveProject } from "../../src/main/stores/projectStore";
import { saveReport } from "../../src/main/stores/reportStore";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";
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
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
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

	describe("handleDeleteProject (cascade historique)", () => {
		it("supprime le projet ET ses rapports, conserve les autres projets", () => {
			// A second project with a scenario and two reports.
			const victim = handleCreateProject({
				name: "À supprimer",
				description: "",
			});
			saveScenario(
				{ ...sample, id: "vic-scn", projectId: victim.id },
				'test("ok", () => {});',
			);
			const mkReport = (runId: string, projectId?: string): Report => ({
				runId,
				scenarioId: "vic-scn",
				scenarioName: "Connexion",
				environmentLabel: "Préprod",
				status: "passed",
				durationMs: 1000,
				startedAt: "2026-06-23T01:00:00Z",
				steps: [],
				...(projectId ? { projectId } : {}),
			});
			saveReport(mkReport("vic-run", victim.id));
			// Legacy report (no projectId) whose scenario belongs to the victim.
			saveReport(mkReport("vic-legacy"));
			// A report from the seeded default project must survive.
			saveReport({
				runId: "keep-run",
				scenarioId: "login",
				scenarioName: "Connexion",
				environmentLabel: "Préprod",
				status: "passed",
				durationMs: 1000,
				startedAt: "2026-06-23T01:00:00Z",
				steps: [],
				projectId: "default",
			});

			handleDeleteProject(victim.id);

			expect(handleListProjects().some((p) => p.id === victim.id)).toBe(false);
			const remaining = handleListReports().map((s) => s.runId);
			expect(remaining).toEqual(["keep-run"]);
		});
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

	it("handleCreateProject construit les environnements fournis (libellé + URL)", () => {
		const p = handleCreateProject({
			name: "Démo",
			description: "",
			environments: [
				{ label: "Préprod", baseURL: "https://preprod.demo" },
				{ label: "Recette", baseURL: "https://recette.demo" },
			],
		});
		expect(p.environments.map((e) => e.label)).toEqual(["Préprod", "Recette"]);
		expect(p.environments.map((e) => e.baseURL)).toEqual([
			"https://preprod.demo",
			"https://recette.demo",
		]);
		// ids dérivés et uniques
		expect(new Set(p.environments.map((e) => e.id)).size).toBe(2);
	});

	it("handleCreateProject sans environnements garde les défauts", () => {
		const p = handleCreateProject({ name: "Démo2", description: "" });
		expect(p.environments.map((e) => e.id)).toEqual(["preprod", "recette"]);
	});

	it("handleCreateProject déduplique les ids d'environnement", () => {
		const p = handleCreateProject({
			name: "Démo3",
			description: "",
			environments: [
				{ label: "Prod", baseURL: "https://a" },
				{ label: "Prod", baseURL: "https://b" },
			],
		});
		expect(p.environments[0].id).not.toBe(p.environments[1].id);
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

	it("handleCreateTunnel applique les défauts couleur/description", () => {
		const t = handleCreateTunnel({ projectId: "p1", name: "Sans couleur" });
		expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
		expect(t.description).toBe("");
	});

	it("handleCreateTunnel respecte couleur/description fournies", () => {
		const t = handleCreateTunnel({
			projectId: "p1",
			name: "Avec couleur",
			color: "#ff3366",
			description: "Parcours d'achat",
		});
		expect(t.color).toBe("#ff3366");
		expect(t.description).toBe("Parcours d'achat");
	});

	it("handleUpdateTunnel modifie name/color/description en préservant l'identité", () => {
		const created = handleCreateTunnel({ projectId: "p1", name: "Avant" });
		const updated = handleUpdateTunnel({
			...created,
			name: "Après",
			color: "#22c55e",
			description: "maj",
		});
		expect(updated.id).toBe(created.id);
		expect(updated.order).toBe(created.order);
		expect(updated.createdAt).toBe(created.createdAt);
		expect(updated.name).toBe("Après");
		expect(updated.color).toBe("#22c55e");
		expect(updated.description).toBe("maj");
		// persisted
		const reread = handleListTunnels("p1").find((x) => x.id === created.id);
		expect(reread?.name).toBe("Après");
		expect(reread?.color).toBe("#22c55e");
	});

	it("handleUpdateTunnel lève si le tunnel n'existe pas", () => {
		expect(() =>
			handleUpdateTunnel({
				id: "ghost",
				projectId: "p1",
				name: "x",
				order: 0,
				color: "#2f6bff",
				description: "",
				createdAt: "2026-01-01T00:00:00.000Z",
			}),
		).toThrow();
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
			color: DEFAULT_TUNNEL_COLOR,
			description: "",
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
