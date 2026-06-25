import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

	it("remonte d'un niveau pour le bouton Retour", () => {
		expect(parentPath("/scenarios/new")).toBe("/scenarios");
		expect(parentPath("/projects")).toBeNull(); // racine = pas de Retour
	});
});
