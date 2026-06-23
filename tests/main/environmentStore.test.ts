import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as env from "../../src/main/stores/environmentStore";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("environmentStore", () => {
	it("renvoie les environnements par défaut si fichier absent", () => {
		expect(env.listEnvironments().map((e) => e.id)).toContain("preprod");
		expect(env.listEnvironments().map((e) => e.id)).toContain("recette");
	});
	it("persiste un environnement ajouté", () => {
		env.saveEnvironment({
			id: "staging",
			label: "Staging",
			baseURL: "https://s.example",
			variables: {},
		});
		expect(env.getEnvironment("staging").baseURL).toBe("https://s.example");
	});
	it("upsert remplace un environnement existant", () => {
		env.saveEnvironment({
			id: "preprod",
			label: "Préprod 2",
			baseURL: "https://pp2.example",
			variables: {},
		});
		expect(env.getEnvironment("preprod").label).toBe("Préprod 2");
		// pas de doublon
		const ids = env.listEnvironments().filter((e) => e.id === "preprod");
		expect(ids).toHaveLength(1);
	});
	it("getEnvironment throw si absent", () => {
		expect(() => env.getEnvironment("nope")).toThrow();
	});
});
