import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewProject from "../../src/renderer/screens/NewProject";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	window.api = {
		createProject: vi.fn().mockResolvedValue({
			id: "demo",
			name: "Démo",
			description: "",
			environments: [],
			createdAt: "2026-06-24T00:00:00Z",
		}),
		listProjects: vi.fn().mockResolvedValue([]),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects: [], activeProjectId: "" });
});
afterEach(() => {
	vi.clearAllMocks();
});

function renderScreen() {
	render(
		<MemoryRouter>
			<NewProject />
		</MemoryRouter>,
	);
}

describe("NewProject", () => {
	it("désactive Créer tant qu'une URL est invalide", () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		// Lignes Préprod/Recette présentes mais URLs vides → bouton désactivé
		const create = screen.getByRole("button", { name: /créer le projet/i });
		expect(create).toBeDisabled();
	});

	it("crée le projet avec les environnements saisis puis navigue dans le projet", async () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		const urlInputs = screen.getAllByPlaceholderText("https://…");
		fireEvent.change(urlInputs[0], {
			target: { value: "https://preprod.demo" },
		});
		fireEvent.change(urlInputs[1], {
			target: { value: "https://recette.demo" },
		});
		const create = screen.getByRole("button", { name: /créer le projet/i });
		await waitFor(() => expect(create).not.toBeDisabled());
		fireEvent.click(create);
		await waitFor(() =>
			expect(
				window.api.createProject as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith({
				name: "Démo",
				description: "",
				environments: [
					{ label: "Préprod", baseURL: "https://preprod.demo" },
					{ label: "Recette", baseURL: "https://recette.demo" },
				],
			}),
		);
		await waitFor(() =>
			expect(navigateMock).toHaveBeenCalledWith("/scenarios"),
		);
		expect(useAppStore.getState().activeProjectId).toBe("demo");
	});

	it("rejette une URL sans http(s)://", () => {
		renderScreen();
		fireEvent.change(screen.getByPlaceholderText("Nom du projet"), {
			target: { value: "Démo" },
		});
		const urlInputs = screen.getAllByPlaceholderText("https://…");
		fireEvent.change(urlInputs[0], { target: { value: "ftp://x" } });
		fireEvent.change(urlInputs[1], { target: { value: "https://ok" } });
		expect(
			screen.getByRole("button", { name: /créer le projet/i }),
		).toBeDisabled();
	});
});
