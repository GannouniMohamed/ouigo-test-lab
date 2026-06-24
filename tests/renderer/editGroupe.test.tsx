import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditGroupe from "../../src/renderer/screens/EditGroupe";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

const tunnel1 = {
	id: "tunnel-1",
	projectId: "proj-1",
	name: "Réservation",
	color: "#2f6bff",
	description: "Tunnel de vente principal",
	position: 0,
};

const tunnel2 = {
	id: "tunnel-2",
	projectId: "proj-1",
	name: "Paiement",
	color: "#00c9b1",
	description: "",
	position: 1,
};

const scenarioInTunnel1 = {
	id: "sc-1",
	projectId: "proj-1",
	tunnelId: "tunnel-1",
	name: "Scénario A",
	steps: [],
	createdAt: "2026-01-01T00:00:00Z",
};

function makeApi(
	overrides: Partial<typeof window.api> = {},
): typeof window.api {
	return {
		listTunnels: vi.fn().mockResolvedValue([tunnel1, tunnel2]),
		updateTunnel: vi.fn().mockResolvedValue(tunnel1),
		deleteTunnel: vi.fn().mockResolvedValue(undefined),
		listScenariosByProject: vi.fn().mockResolvedValue([]),
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

function renderAt(tunnelId = "tunnel-1") {
	render(
		<MemoryRouter initialEntries={[`/scenarios/groups/${tunnelId}/edit`]}>
			<Routes>
				<Route
					path="/scenarios/groups/:tunnelId/edit"
					element={<EditGroupe />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("EditGroupe", () => {
	it("charge le tunnel et pré-remplit le nom et la description", async () => {
		renderAt("tunnel-1");
		expect(await screen.findByDisplayValue("Réservation")).toBeTruthy();
		expect(screen.getByDisplayValue("Tunnel de vente principal")).toBeTruthy();
	});

	it("appelle updateTunnel avec les champs modifiés en préservant l'id", async () => {
		renderAt("tunnel-1");
		const nameInput = await screen.findByDisplayValue("Réservation");
		fireEvent.change(nameInput, { target: { value: "Réservation modifiée" } });
		fireEvent.click(
			screen.getByRole("button", { name: /enregistrer les modifications/i }),
		);
		await waitFor(() =>
			expect(
				window.api.updateTunnel as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "tunnel-1",
					name: "Réservation modifiée",
				}),
			),
		);
	});

	it("désactive le bouton Supprimer quand le groupe a des scénarios", async () => {
		window.api = makeApi({
			listScenariosByProject: vi.fn().mockResolvedValue([scenarioInTunnel1]),
		});
		renderAt("tunnel-1");
		await screen.findByDisplayValue("Réservation");
		const deleteBtn = screen.getByRole("button", { name: /supprimer/i });
		expect(deleteBtn).toBeDisabled();
	});

	it("active le bouton Supprimer et appelle deleteTunnel quand le groupe est vide et pas le dernier", async () => {
		window.api = makeApi({
			listScenariosByProject: vi.fn().mockResolvedValue([]),
		});
		renderAt("tunnel-1");
		await screen.findByDisplayValue("Réservation");
		const deleteBtn = screen.getByRole("button", { name: /supprimer/i });
		expect(deleteBtn).not.toBeDisabled();
		await userEvent.click(deleteBtn);
		await waitFor(() =>
			expect(
				window.api.deleteTunnel as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith("proj-1", "tunnel-1"),
		);
	});
});
