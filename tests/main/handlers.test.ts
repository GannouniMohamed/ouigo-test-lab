import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleDeleteScenario,
	handleGetReport,
	handleGetScenario,
	handleListEnvironments,
	handleListReports,
	handleListScenarios,
	handleSaveEnvironment,
} from "../../src/main/ipc/handlers";
import { saveReport } from "../../src/main/stores/reportStore";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Environment, Report, Scenario } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-handlers-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

const sample: Scenario = {
	id: "login",
	name: "Connexion",
	platform: "web",
	browser: "chromium",
	defaultEnvironmentId: "preprod",
	tags: ["auth"],
	specFile: "login.spec.ts",
	createdAt: "2026-06-23T00:00:00Z",
	lastRun: { status: "never" },
};

const sampleEnv: Environment = {
	id: "staging",
	label: "Staging",
	baseURL: "https://staging.example",
	variables: {},
};

describe("handlers", () => {
	describe("handleListScenarios", () => {
		it("returns seeded scenario", () => {
			saveScenario(sample, 'test("ok", () => {});');
			const result = handleListScenarios();
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Connexion");
		});

		it("returns empty array when no scenarios", () => {
			expect(handleListScenarios()).toEqual([]);
		});
	});

	describe("handleGetScenario", () => {
		it("returns scenario by id", () => {
			saveScenario(sample, "x");
			const result = handleGetScenario("login");
			expect(result.specFile).toBe("login.spec.ts");
		});

		it("throws when scenario not found", () => {
			expect(() => handleGetScenario("nonexistent")).toThrow(
				"Scenario not found",
			);
		});
	});

	describe("handleDeleteScenario", () => {
		it("deletes a scenario", () => {
			saveScenario(sample, "x");
			handleDeleteScenario("login");
			expect(handleListScenarios()).toHaveLength(0);
		});
	});

	describe("handleListEnvironments", () => {
		it("contains preprod by default", () => {
			const envs = handleListEnvironments();
			expect(envs.map((e) => e.id)).toContain("preprod");
		});

		it("contains recette by default", () => {
			const envs = handleListEnvironments();
			expect(envs.map((e) => e.id)).toContain("recette");
		});
	});

	describe("handleSaveEnvironment", () => {
		it("persists and retrieves an environment", () => {
			handleSaveEnvironment(sampleEnv);
			const envs = handleListEnvironments();
			expect(envs.map((e) => e.id)).toContain("staging");
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
});
