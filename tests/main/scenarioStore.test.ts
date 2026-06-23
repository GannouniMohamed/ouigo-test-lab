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
	it("sauvegarde puis liste un scénario", () => {
		store.saveScenario(sample, 'test("ok", () => {});');
		const all = store.listScenarios();
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe("Connexion");
	});
	it("getScenario renvoie le scénario", () => {
		store.saveScenario(sample, "x");
		expect(store.getScenario("login").specFile).toBe("login.spec.ts");
	});
	it("met à jour lastRun", () => {
		store.saveScenario(sample, "x");
		store.updateLastRun("login", {
			status: "passed",
			at: "2026-06-23T01:00:00Z",
			durationMs: 1200,
		});
		expect(store.getScenario("login").lastRun.status).toBe("passed");
	});
	it("supprime un scénario", () => {
		store.saveScenario(sample, "x");
		store.deleteScenario("login");
		expect(store.listScenarios()).toHaveLength(0);
	});
	it("listScenarios renvoie [] si aucun scénario", () => {
		expect(store.listScenarios()).toEqual([]);
	});
});
