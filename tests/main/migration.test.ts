import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateWorkspaceIfNeeded } from "../../src/main/migration";
import { getProject, listProjects } from "../../src/main/stores/projectStore";
import { listScenariosByProject } from "../../src/main/stores/scenarioStore";
import { listTunnels } from "../../src/main/stores/tunnelStore";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mig-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

// Builds the legacy flat layout: scenarios/<id>/{meta,spec} + environments.json
function writeLegacy(): void {
	const sdir = join(dir, "scenarios", "login");
	mkdirSync(sdir, { recursive: true });
	writeFileSync(
		join(sdir, "scenario.meta.json"),
		JSON.stringify({
			id: "login",
			name: "Connexion",
			platform: "web",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "login.spec.ts",
			createdAt: "2026-06-23T00:00:00Z",
			lastRun: { status: "never" },
		}),
		"utf-8",
	);
	writeFileSync(join(sdir, "login.spec.ts"), "// spec", "utf-8");
	writeFileSync(
		join(dir, "environments.json"),
		JSON.stringify({
			environments: [
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "https://preprod.example",
					variables: {},
				},
			],
		}),
		"utf-8",
	);
}

describe("migrateWorkspaceIfNeeded", () => {
	it("ne fait rien si aucun ancien layout", () => {
		migrateWorkspaceIfNeeded();
		expect(listProjects()).toEqual([]);
	});
	it("crée le projet par défaut et le tunnel Général", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		const projects = listProjects();
		expect(projects.map((p) => p.id)).toEqual(["default"]);
		expect(getProject("default").name).toBe("Projet par défaut");
		expect(listTunnels("default").map((t) => t.id)).toEqual(["general"]);
	});
	it("préserve les environnements de l'ancien environments.json", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		expect(getProject("default").environments.map((e) => e.id)).toContain(
			"preprod",
		);
	});
	it("déplace les scénarios dans le tunnel Général avec projectId/tunnelId", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		const scenarios = listScenariosByProject("default");
		expect(scenarios).toHaveLength(1);
		expect(scenarios[0].projectId).toBe("default");
		expect(scenarios[0].tunnelId).toBe("general");
	});
	it("supprime l'ancien dossier scenarios/ et environments.json", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		expect(existsSync(join(dir, "scenarios"))).toBe(false);
		expect(existsSync(join(dir, "environments.json"))).toBe(false);
	});
	it("est idempotent — un 2e appel ne duplique rien", () => {
		writeLegacy();
		migrateWorkspaceIfNeeded();
		migrateWorkspaceIfNeeded();
		expect(listProjects()).toHaveLength(1);
		expect(listScenariosByProject("default")).toHaveLength(1);
	});
});
