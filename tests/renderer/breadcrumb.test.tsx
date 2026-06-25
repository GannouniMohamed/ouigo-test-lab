import { describe, expect, it } from "vitest";
import { buildCrumbs, parentPath } from "../../src/renderer/lib/breadcrumb";

describe("breadcrumb", () => {
	it("résout la hiérarchie d'un écran de lot", () => {
		const crumbs = buildCrumbs("/batch/abc", {
			projectName: "Ouigo.com",
			scenarioName: "Parcours de connexion",
		});
		expect(crumbs.map((c) => c.label)).toEqual([
			"Projets",
			"Ouigo.com",
			"Scénarios",
			"Parcours de connexion",
			"Lot",
		]);
		expect(crumbs.at(-1)?.to).toBeUndefined(); // courant non cliquable
	});

	it("nomme le dernier segment « Rapports » sur /reports", () => {
		const crumbs = buildCrumbs("/reports", { projectName: "Ouigo.com" });
		expect(crumbs.at(-1)?.label).toBe("Rapports");
	});

	it("marque le crumb projet avec kind « project » et garde son `to`", () => {
		const crumbs = buildCrumbs("/scenarios", { projectName: "Ouigo.com" });
		const projectCrumb = crumbs.find((c) => c.label === "Ouigo.com");
		expect(projectCrumb?.kind).toBe("project");
		expect(projectCrumb?.to).toBe("/scenarios");
		// Les autres crumbs ne portent pas ce kind.
		expect(crumbs.find((c) => c.label === "Projets")?.kind).toBeUndefined();
	});

	it("remonte d'un niveau pour le bouton Retour", () => {
		expect(parentPath("/scenarios/new")).toBe("/scenarios");
		expect(parentPath("/projects")).toBeNull(); // racine = pas de Retour
	});

	it("garde un Retour sur les écrans liés à un scénario (segment scénario non cliquable)", () => {
		// Le crumb « scénario » n'a pas de `to` : Retour doit sauter jusqu'au hub.
		expect(parentPath("/report/run-1")).toBe("/scenarios");
		expect(parentPath("/batch/abc")).toBe("/scenarios");
		expect(parentPath("/run/run-1")).toBe("/scenarios");
	});
});
