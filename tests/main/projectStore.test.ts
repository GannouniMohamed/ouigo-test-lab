import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/projectStore";
import type { Project } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-proj-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

function sample(id = "p1"): Project {
	return {
		id,
		name: "Projet A",
		description: "desc",
		environments: store.defaultEnvironments(),
		createdAt: "2026-06-24T00:00:00Z",
	};
}

describe("projectStore", () => {
	it("listProjects renvoie [] si aucun projet", () => {
		expect(store.listProjects()).toEqual([]);
	});
	it("sauvegarde puis liste un projet", () => {
		store.saveProject(sample());
		const all = store.listProjects();
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe("Projet A");
	});
	it("getProject renvoie le projet", () => {
		store.saveProject(sample());
		expect(store.getProject("p1").description).toBe("desc");
	});
	it("defaultEnvironments contient preprod et recette", () => {
		const ids = store.defaultEnvironments().map((e) => e.id);
		expect(ids).toContain("preprod");
		expect(ids).toContain("recette");
	});
	it("listEnvironments renvoie les environnements du projet", () => {
		store.saveProject(sample());
		expect(store.listEnvironments("p1").length).toBeGreaterThanOrEqual(2);
	});
	it("getEnvironment renvoie un environnement par id", () => {
		store.saveProject(sample());
		expect(store.getEnvironment("p1", "preprod").label).toBe("Préprod");
	});
	it("saveEnvironment ajoute puis met à jour un environnement", () => {
		store.saveProject(sample());
		store.saveEnvironment("p1", {
			id: "prod",
			label: "Prod",
			baseURL: "https://prod.example",
			variables: {},
		});
		expect(store.getEnvironment("p1", "prod").label).toBe("Prod");
		store.saveEnvironment("p1", {
			id: "prod",
			label: "Production",
			baseURL: "https://prod.example",
			variables: {},
		});
		expect(store.getEnvironment("p1", "prod").label).toBe("Production");
	});
	it("deleteEnvironment supprime sauf le dernier", () => {
		store.saveProject({
			...sample(),
			environments: store.defaultEnvironments(),
		});
		store.deleteEnvironment("p1", "recette");
		expect(store.listEnvironments("p1").map((e) => e.id)).not.toContain(
			"recette",
		);
	});
	it("deleteEnvironment refuse de supprimer le dernier environnement", () => {
		store.saveProject({
			id: "p1",
			name: "x",
			description: "",
			environments: [
				{ id: "only", label: "Only", baseURL: "https://e", variables: {} },
			],
			createdAt: "2026-06-24T00:00:00Z",
		});
		expect(() => store.deleteEnvironment("p1", "only")).toThrow();
	});
	it("deleteProject supprime sauf le dernier projet", () => {
		store.saveProject(sample("p1"));
		store.saveProject(sample("p2"));
		store.deleteProject("p1");
		expect(store.listProjects().map((p) => p.id)).toEqual(["p2"]);
	});
	it("deleteProject refuse de supprimer le dernier projet", () => {
		store.saveProject(sample("p1"));
		expect(() => store.deleteProject("p1")).toThrow();
	});
	it("deleteProject lève une erreur si le projet est inconnu", () => {
		store.saveProject(sample("p1"));
		store.saveProject(sample("p2"));
		expect(() => store.deleteProject("nope")).toThrow();
	});
});
