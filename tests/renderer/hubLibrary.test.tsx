import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "booking",
		projectId: "default",
		name: "Réservation",
		order: 1,
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

	it("lance avec l'environnement actif du projet", async () => {
		useAppStore.setState({ activeEnvByProject: { default: "recette" } });
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		fireEvent.click(screen.getAllByRole("button", { name: /lancer/i })[0]);
		await waitFor(() =>
			expect(
				window.api.runScenario as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalled(),
		);
		const call = (window.api.runScenario as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0];
		expect(call[3]).toBe("recette"); // envId
	});

	it("Lancer appelle runScenario avec projectId et tunnelId", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Connexion");
		const launchButtons = screen.getAllByRole("button", { name: /lancer/i });
		fireEvent.click(launchButtons[0]);
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
});
