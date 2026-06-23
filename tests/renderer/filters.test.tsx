import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HubLibrary from "../../src/renderer/screens/HubLibrary";
import type { Scenario } from "../../src/shared/types";

const scenarios: Scenario[] = [
	{
		id: "login",
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
		name: "Connexion mobile",
		platform: "mobile",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "mob.spec.ts",
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
		listScenarios: vi.fn().mockResolvedValue(scenarios),
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
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

describe("HubLibrary filtres/recherche/env", () => {
	it("filtre par plateforme Web", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		await userEvent.click(screen.getByRole("button", { name: "Web" }));
		expect(screen.getByText("Parcours de connexion")).toBeInTheDocument();
		expect(screen.queryByText("Connexion mobile")).not.toBeInTheDocument();
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
		).toHaveBeenCalledWith("login", "recette");
	});
});
