import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectContextBar } from "../../src/renderer/components/ProjectContextBar";
import { useAppStore } from "../../src/renderer/store";

const projects = [
	{
		id: "ouigo",
		name: "Ouigo.com",
		description: "",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
			{ id: "recette", label: "Recette", baseURL: "https://r", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "ouisncf",
		name: "OUI.sncf",
		description: "",
		environments: [],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	useAppStore.setState({
		projects,
		activeProjectId: "ouigo",
		activeEnvByProject: {},
		scenarios: [],
	});
});
afterEach(() => {
	localStorage.clear();
	useAppStore.setState({
		activeEnvByProject: {},
		activeProjectId: "ouigo",
	});
});

function renderAt(path: string) {
	render(
		<MemoryRouter initialEntries={[path]}>
			<ProjectContextBar />
		</MemoryRouter>,
	);
}

describe("ProjectContextBar", () => {
	it("est masquée sur /projects", () => {
		const { container } = render(
			<MemoryRouter initialEntries={["/projects"]}>
				<ProjectContextBar />
			</MemoryRouter>,
		);
		expect(container.querySelector(".otl-ctxbar")).toBeNull();
	});
	it("affiche le projet actif et un sélecteur d'environnement sur /scenarios", () => {
		renderAt("/scenarios");
		expect(screen.getByLabelText(/projet actif/i)).toBeTruthy();
		expect(screen.getByLabelText(/environnement actif/i)).toBeTruthy();
	});
	it("n'expose qu'un seul contrôle « Projet actif » (intégré au fil d'Ariane)", () => {
		renderAt("/scenarios");
		// Le sélecteur de projet est désormais uniquement dans le fil d'Ariane.
		expect(screen.getAllByLabelText(/projet actif/i)).toHaveLength(1);
		// Plus de <select> natif redondant.
		const { container } = render(
			<MemoryRouter initialEntries={["/scenarios"]}>
				<ProjectContextBar />
			</MemoryRouter>,
		);
		expect(container.querySelector(".otl-ctxbar__project")).toBeNull();
	});
	it("le switcher de projet du fil d'Ariane change le projet actif", () => {
		renderAt("/scenarios");
		fireEvent.click(screen.getByLabelText(/projet actif/i));
		fireEvent.click(screen.getByRole("option", { name: "OUI.sncf" }));
		expect(useAppStore.getState().activeProjectId).toBe("ouisncf");
	});
	it("choisir un environnement met à jour activeEnvByProject", () => {
		renderAt("/scenarios");
		fireEvent.click(screen.getByLabelText(/environnement actif/i));
		fireEvent.click(screen.getByRole("option", { name: "Recette" }));
		expect(useAppStore.getState().activeEnvByProject.ouigo).toBe("recette");
	});

	it("affiche le 1er env comme défaut (sans l'écrire) quand aucun n'est choisi", () => {
		renderAt("/scenarios");
		// Plus de placeholder vide : le picker montre le 1er env du projet…
		expect(screen.getByLabelText(/environnement actif/i).textContent).toContain(
			"Préprod",
		);
		// …mais sans écrire dans le store (les runs gardent leur env hérité).
		expect(useAppStore.getState().activeEnvByProject.ouigo).toBeUndefined();
	});
});
