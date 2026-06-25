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
];

beforeEach(() => {
	useAppStore.setState({
		projects,
		activeProjectId: "ouigo",
		activeEnvByProject: {},
	});
});
afterEach(() => {
	localStorage.clear();
	useAppStore.setState({ activeEnvByProject: {} });
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
	it("choisir un environnement met à jour activeEnvByProject", () => {
		renderAt("/scenarios");
		fireEvent.click(screen.getByLabelText(/environnement actif/i));
		fireEvent.click(screen.getByRole("option", { name: "Recette" }));
		expect(useAppStore.getState().activeEnvByProject.ouigo).toBe("recette");
	});

	it("affiche le placeholder « Environnement » quand aucun env n'est choisi", () => {
		renderAt("/scenarios");
		expect(screen.getByLabelText(/environnement actif/i).textContent).toContain(
			"Environnement",
		);
	});
});
