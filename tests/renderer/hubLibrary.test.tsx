import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HubLibrary from "../../src/renderer/screens/HubLibrary";
import { useAppStore } from "../../src/renderer/store";

const scenarios = [
	{
		id: "login",
		projectId: "default",
		tunnelId: "general",
		name: "Connexion",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "local",
		tags: [],
		specFile: "login.spec.ts",
		createdAt: "2026-06-24T00:00:00Z",
		recordedStepCount: 12,
		lastRun: { status: "never" },
	},
	{
		id: "search",
		projectId: "default",
		tunnelId: "booking",
		name: "Recherche train",
		platform: "responsive",
		browser: "chromium",
		defaultEnvironmentId: "local",
		tags: [],
		specFile: "search.spec.ts",
		createdAt: "2026-06-24T00:00:00Z",
		lastRun: { status: "passed", at: "2026-06-24T01:00:00Z", durationMs: 900 },
	},
];

const tunnels = [
	{
		id: "general",
		projectId: "default",
		name: "Général",
		order: 0,
		color: "#00c9b1",
		description: "",
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "booking",
		projectId: "default",
		name: "Réservation",
		order: 1,
		color: "#2f6bff",
		description: "",
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "empty-tunnel",
		projectId: "default",
		name: "Groupe vide",
		order: 2,
		color: "#ff3366",
		description: "",
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listScenariosByProject: vi.fn().mockResolvedValue(scenarios),
		listTunnels: vi.fn().mockResolvedValue(tunnels),
		listEnvironments: vi.fn().mockResolvedValue([]),
		runScenario: vi.fn().mockResolvedValue({ runId: "run-1" }),
	} as unknown as typeof window.api;
	useAppStore.setState({ activeProjectId: "default", scenarios: [] });
});
afterEach(() => {
	vi.clearAllMocks();
});

describe("HubLibrary", () => {
	it("affiche les scénarios groupés par tunnel", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		expect(await screen.findByText("Général")).toBeTruthy();
		expect(screen.getByText("Réservation")).toBeTruthy();
		expect(screen.getByText("Connexion")).toBeTruthy();
		expect(screen.getByText("Recherche train")).toBeTruthy();
	});

	it("affiche le nombre d'étapes enregistrées, même sans exécution", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		// "Connexion" was never run but has 12 recorded steps → they must show.
		await screen.findByText("Connexion");
		expect(screen.getByText(/12 étapes/)).toBeInTheDocument();
	});

	it("affiche les stats de groupe dans l'en-tête", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		// "Général" has 1 scenario with status "never" → "1 jamais exécuté"
		// "Réservation" has 1 scenario with status "passed" → "1 réussi"
		await screen.findByText("Connexion");
		expect(screen.getByText("1 jamais exécuté")).toBeInTheDocument();
		expect(screen.getByText("1 réussi")).toBeInTheDocument();
	});

	it("lance avec l'environnement actif du projet (via le dialogue d'options)", async () => {
		useAppStore.setState({ activeEnvByProject: { default: "recette" } });
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		// "Lancer" opens the run-options dialog; "Démarrer" actually runs.
		fireEvent.click(screen.getAllByRole("button", { name: /lancer/i })[0]);
		fireEvent.click(await screen.findByRole("button", { name: /Démarrer/ }));
		await waitFor(() =>
			expect(
				window.api.runScenario as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalled(),
		);
		const call = (window.api.runScenario as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0];
		expect(call[3]).toBe("recette"); // envId
		expect(call[4]).toEqual({ headed: true }); // default display mode
	});

	it("Lancer → Démarrer appelle runScenario avec projectId et tunnelId", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		const launchButtons = screen.getAllByRole("button", { name: /lancer/i });
		fireEvent.click(launchButtons[0]);
		fireEvent.click(await screen.findByRole("button", { name: /Démarrer/ }));
		await waitFor(() =>
			expect(
				window.api.runScenario as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalled(),
		);
		const call = (window.api.runScenario as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0];
		// (projectId, tunnelId, scenarioId, envId)
		expect(call[0]).toBe("default");
		expect(call[1]).toBe("general");
		expect(call[2]).toBe("login");
	});

	it("permet de choisir le mode Invisible (headless) dans le dialogue", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		fireEvent.click(screen.getAllByRole("button", { name: /lancer/i })[0]);
		fireEvent.click(await screen.findByRole("button", { name: /Invisible/ }));
		fireEvent.click(screen.getByRole("button", { name: /Démarrer/ }));
		await waitFor(() =>
			expect(
				window.api.runScenario as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalled(),
		);
		const call = (window.api.runScenario as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0];
		expect(call[4]).toEqual({ headed: false });
	});

	it("affiche '1ʳᵉ exécution…' et cache Lancer pour le scénario en first-run", async () => {
		useAppStore.setState({ firstRunScenarioId: "login" });
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		// The running scenario shows the first-run label
		expect(screen.getByText(/1ʳᵉ exécution…/)).toBeInTheDocument();
		// The running scenario's row has no "Lancer" button — only the other scenario does
		const launchButtons = screen.getAllByRole("button", { name: /lancer/i });
		expect(launchButtons).toHaveLength(1);
		// The other scenario (Recherche train) still has a Lancer button
		expect(screen.getByText("Recherche train")).toBeInTheDocument();
		// Reset
		useAppStore.setState({ firstRunScenarioId: null });
	});

	it("sélectionner un groupe vide affiche son en-tête et son bouton Éditer", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		// Wait for data to load
		await screen.findByText("Connexion");
		// Click the "Groupe vide · 0" tab
		const tab = await screen.findByRole("button", {
			name: /Groupe vide\s*·\s*0/,
		});
		await userEvent.click(tab);
		// The section header should be rendered even though the group is empty
		expect(screen.getByText("Groupe vide")).toBeInTheDocument();
		// The "Éditer" button should be present
		expect(screen.getByRole("button", { name: "Éditer" })).toBeInTheDocument();
		// The empty hint should be shown
		expect(
			screen.getByText("Aucun scénario dans ce groupe."),
		).toBeInTheDocument();
		// No scenario cards
		expect(screen.queryByText("Connexion")).not.toBeInTheDocument();
	});
});
