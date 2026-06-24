import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HubLibrary from "../../src/renderer/screens/HubLibrary";
import { useAppStore } from "../../src/renderer/store";
import type { Scenario } from "../../src/shared/types";

const scenarios: Scenario[] = [
	{
		id: "login",
		projectId: "default",
		tunnelId: "general",
		name: "Parcours de connexion",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "login.spec.ts",
		createdAt: "2026-06-23T00:00:00Z",
		lastRun: { status: "passed", at: "2026-06-23T14:00:00Z", durationMs: 8400 },
	},
	{
		id: "mob",
		projectId: "default",
		tunnelId: "booking",
		name: "Connexion mobile",
		platform: "mobile",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "mob.spec.ts",
		createdAt: "2026-06-23T00:00:00Z",
		lastRun: { status: "never" },
	},
	{
		id: "resp",
		projectId: "default",
		tunnelId: "booking",
		name: "Parcours responsive",
		platform: "responsive",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "resp.spec.ts",
		createdAt: "2026-06-23T00:00:00Z",
		lastRun: { status: "never" },
	},
];

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listScenariosByProject: vi.fn().mockResolvedValue(scenarios),
		listTunnels: vi.fn().mockResolvedValue([
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
		]),
		listEnvironments: vi.fn().mockResolvedValue([
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://pp.example",
				variables: {},
			},
			{
				id: "recette",
				label: "Recette",
				baseURL: "https://r.example",
				variables: {},
			},
		]),
		runScenario: vi.fn().mockResolvedValue({ runId: "run-x" }),
	};
	useAppStore.setState({ activeProjectId: "default" });
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
	useAppStore.setState({ activeProjectId: "", scenarios: [] });
});

describe("HubLibrary filtres/recherche/env", () => {
	it("filtre par groupe (Général masque les scénarios des autres groupes)", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		// Click the "Général · N" group tab
		const tab = await screen.findByRole("button", { name: /Général · \d/ });
		await userEvent.click(tab);
		// "Parcours de connexion" is in Général — still visible
		expect(screen.getByText("Parcours de connexion")).toBeInTheDocument();
		// "Connexion mobile" is in Réservation — hidden
		expect(screen.queryByText("Connexion mobile")).not.toBeInTheDocument();
	});
	it("filtre par groupe (Réservation masque les scénarios des autres groupes)", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		// Click the "Réservation · N" group tab
		const tab = await screen.findByRole("button", { name: /Réservation · \d/ });
		await userEvent.click(tab);
		// "Connexion mobile" is in Réservation — visible
		expect(screen.getByText("Connexion mobile")).toBeInTheDocument();
		// "Parcours de connexion" is in Général — hidden
		expect(screen.queryByText("Parcours de connexion")).not.toBeInTheDocument();
	});
	it("recherche par nom", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "mobile");
		expect(screen.queryByText("Parcours de connexion")).not.toBeInTheDocument();
		expect(screen.getByText("Connexion mobile")).toBeInTheDocument();
	});
	it("l'environnement choisi est utilisé au lancement", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		await userEvent.selectOptions(screen.getByRole("combobox"), "recette");
		await userEvent.click(
			screen.getAllByRole("button", { name: /lancer/i })[0],
		);
		expect(
			window.api.runScenario as unknown as ReturnType<typeof vi.fn>,
		).toHaveBeenCalledWith("default", "general", "login", "recette");
	});
});
