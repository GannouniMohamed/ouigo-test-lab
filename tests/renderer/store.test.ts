import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../src/renderer/store";

afterEach(() => {
	localStorage.clear();
	useAppStore.setState({ activeEnvByProject: {}, firstRunScenarioId: null });
});

describe("store firstRunScenarioId", () => {
	it("setFirstRunScenarioId pose puis efface le flag", () => {
		expect(useAppStore.getState().firstRunScenarioId).toBeNull();
		useAppStore.getState().setFirstRunScenarioId("scn-1");
		expect(useAppStore.getState().firstRunScenarioId).toBe("scn-1");
		useAppStore.getState().setFirstRunScenarioId(null);
		expect(useAppStore.getState().firstRunScenarioId).toBeNull();
	});
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
