import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/scenarioStore";
import type { Scenario } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-"));
	process.env.OTL_WORKSPACE = dir;
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

describe("scenarioStore", () => {
	it("sauvegarde puis liste un scénario dans son tunnel", () => {
		store.saveScenario(sample, 'test("ok", () => {});');
		const all = store.listScenarios("default", "general");
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe("Connexion");
	});
	it("getScenario renvoie le scénario", () => {
		store.saveScenario(sample, "x");
		expect(store.getScenario("default", "general", "login").specFile).toBe(
			"login.spec.ts",
		);
	});
	it("listScenariosByProject agrège tous les tunnels", () => {
		store.saveScenario(sample, "x");
		store.saveScenario(
			{ ...sample, id: "search", tunnelId: "booking", name: "Recherche" },
			"x",
		);
		const all = store.listScenariosByProject("default");
		expect(all.map((s) => s.id).sort()).toEqual(["login", "search"]);
	});
	it("met à jour lastRun", () => {
		store.saveScenario(sample, "x");
		store.updateLastRun("default", "general", "login", {
			status: "passed",
			at: "2026-06-23T01:00:00Z",
			durationMs: 1200,
		});
		expect(
			store.getScenario("default", "general", "login").lastRun.status,
		).toBe("passed");
	});
	it("supprime un scénario", () => {
		store.saveScenario(sample, "x");
		store.deleteScenario("default", "general", "login");
		expect(store.listScenarios("default", "general")).toHaveLength(0);
	});
	it("listScenarios renvoie [] si aucun scénario", () => {
		expect(store.listScenarios("default", "general")).toEqual([]);
	});
});
