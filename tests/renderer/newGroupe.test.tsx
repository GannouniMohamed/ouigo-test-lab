import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewGroupe from "../../src/renderer/screens/NewGroupe";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

function makeApi(
	overrides: Partial<typeof window.api> = {},
): typeof window.api {
	return {
		listTunnels: vi.fn().mockResolvedValue([]),
		createTunnel: vi.fn().mockResolvedValue({ id: "t1" }),
		...overrides,
	} as unknown as typeof window.api;
}

beforeEach(() => {
	navigateMock.mockReset();
	window.api = makeApi();
	useAppStore.setState({ projects: [], activeProjectId: "proj-1" });
});
afterEach(() => {
	vi.clearAllMocks();
});

function renderNewGroupe(
	overrides: { createTunnel?: ReturnType<typeof vi.fn> } = {},
) {
	if (overrides.createTunnel) {
		window.api = makeApi({ createTunnel: overrides.createTunnel });
	}
	render(
		<MemoryRouter>
			<NewGroupe />
		</MemoryRouter>,
	);
}

describe("NewGroupe", () => {
	it("désactive Créer tant que le nom est vide", () => {
		renderNewGroupe();
		expect(
			screen.getByRole("button", { name: /créer le groupe/i }),
		).toBeDisabled();
	});

	it("crée un groupe avec couleur et description", async () => {
		const createTunnel = vi.fn().mockResolvedValue({ id: "t1" });
		renderNewGroupe({ createTunnel });
		await userEvent.type(
			screen.getByPlaceholderText(/nom du groupe/i),
			"Réservation",
		);
		await userEvent.type(
			screen.getByPlaceholderText(/description/i),
			"tunnel de vente",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /créer le groupe/i }),
		);
		expect(createTunnel).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: expect.any(String),
				name: "Réservation",
				description: "tunnel de vente",
				color: expect.any(String),
			}),
		);
	});

	it("affiche le fil d'Ariane et le titre", () => {
		renderNewGroupe();
		expect(screen.getAllByText(/scénarios/i).length).toBeGreaterThan(0);
		expect(
			screen.getByRole("heading", { name: /nouveau groupe/i }),
		).toBeTruthy();
	});

	it("navigue vers /scenarios lors de l'annulation", async () => {
		renderNewGroupe();
		fireEvent.click(screen.getByRole("button", { name: /annuler/i }));
		await waitFor(() =>
			expect(navigateMock).toHaveBeenCalledWith("/scenarios"),
		);
	});
});
