import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Projects from "../../src/renderer/screens/Projects";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

const projects = [
	{
		id: "ouigo",
		name: "Ouigo.com",
		description: "Site de réservation grand public.",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
			{ id: "recette", label: "Recette", baseURL: "https://r", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	navigateMock.mockReset();
	window.api = {
		listProjects: vi.fn().mockResolvedValue(projects),
		listScenariosByProject: vi
			.fn()
			.mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
		deleteProject: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
	useAppStore.setState({
		projects,
		activeProjectId: "ouigo",
		setActiveProjectId: useAppStore.getState().setActiveProjectId,
	});
});
afterEach(() => vi.clearAllMocks());

function renderScreen() {
	render(
		<MemoryRouter>
			<Projects />
		</MemoryRouter>,
	);
}

describe("Projects landing", () => {
	it("affiche une carte projet avec compteurs", async () => {
		renderScreen();
		expect(await screen.findByText("Ouigo.com")).toBeTruthy();
		expect(screen.getByText(/2 environnements/i)).toBeTruthy();
		expect(screen.getByText(/2 scénarios/i)).toBeTruthy();
	});
	it("« Nouveau projet » navigue vers /projects/new", async () => {
		renderScreen();
		await screen.findByText("Ouigo.com");
		fireEvent.click(screen.getByRole("button", { name: /nouveau projet/i }));
		expect(navigateMock).toHaveBeenCalledWith("/projects/new");
	});
	it("« Ouvrir » rend le projet actif et va aux scénarios", async () => {
		renderScreen();
		await screen.findByText("Ouigo.com");
		fireEvent.click(screen.getByRole("button", { name: /ouvrir/i }));
		await waitFor(() =>
			expect(useAppStore.getState().activeProjectId).toBe("ouigo"),
		);
		expect(navigateMock).toHaveBeenCalledWith("/scenarios");
	});
	it("la corbeille ouvre une confirmation et ne supprime pas tout de suite", async () => {
		const two = [
			projects[0],
			{ ...projects[0], id: "decat", name: "Decathlon", environments: [] },
		];
		(
			window.api.listProjects as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(two);
		useAppStore.setState({ projects: two });
		renderScreen();
		await screen.findByText("Decathlon");

		const trashButtons = screen.getAllByRole("button", {
			name: /supprimer le projet/i,
		});
		fireEvent.click(trashButtons[1]);

		// Modal asks for confirmation; nothing deleted yet.
		expect(
			screen.getByText(/supprimer le projet « Decathlon » \?/i),
		).toBeInTheDocument();
		expect(screen.getByText(/irréversible.*historique/i)).toBeInTheDocument();
		expect(window.api.deleteProject).not.toHaveBeenCalled();

		// Confirm.
		fireEvent.click(
			screen.getByRole("button", { name: /supprimer définitivement/i }),
		);
		await waitFor(() =>
			expect(window.api.deleteProject).toHaveBeenCalledWith("decat"),
		);
	});

	it("« Annuler » ferme la confirmation sans supprimer", async () => {
		const two = [
			projects[0],
			{ ...projects[0], id: "decat", name: "Decathlon", environments: [] },
		];
		(
			window.api.listProjects as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(two);
		useAppStore.setState({ projects: two });
		renderScreen();
		await screen.findByText("Decathlon");

		fireEvent.click(
			screen.getAllByRole("button", { name: /supprimer le projet/i })[1],
		);
		fireEvent.click(screen.getByRole("button", { name: /annuler/i }));

		expect(
			screen.queryByText(/supprimer le projet « Decathlon » \?/i),
		).not.toBeInTheDocument();
		expect(window.api.deleteProject).not.toHaveBeenCalled();
	});

	it("affiche l'état vide quand aucun projet", async () => {
		(
			window.api.listProjects as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue([]);
		useAppStore.setState({ projects: [] });
		renderScreen();
		expect(
			await screen.findByText(/aucun projet pour l'instant/i),
		).toBeTruthy();
	});
});
