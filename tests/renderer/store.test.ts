import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../src/renderer/store";

afterEach(() => {
	localStorage.clear();
	useAppStore.setState({ activeEnvByProject: {} });
});

describe("store activeEnvByProject", () => {
	it("setActiveEnv enregistre l'env actif d'un projet et persiste", () => {
		useAppStore.getState().setActiveEnv("p1", "preprod");
		expect(useAppStore.getState().activeEnvByProject.p1).toBe("preprod");
		expect(localStorage.getItem("otl.activeEnvByProject")).toContain("preprod");
	});
	it("setActiveEnv n'écrase pas les autres projets", () => {
		useAppStore.getState().setActiveEnv("p1", "preprod");
		useAppStore.getState().setActiveEnv("p2", "recette");
		expect(useAppStore.getState().activeEnvByProject).toEqual({
			p1: "preprod",
			p2: "recette",
		});
	});
});
