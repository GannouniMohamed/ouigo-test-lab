import { render, screen, waitFor } from "@testing-library/react";
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
		id: "buy",
		name: "Achat billet",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "buy.spec.ts",
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
	// biome-ignore lint/suspicious/noExplicitAny: test utility cast
	(globalThis as any).window.api = {
		listScenarios: vi.fn().mockResolvedValue(scenarios),
		listEnvironments: vi.fn().mockResolvedValue([
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://pp.example",
				variables: {},
			},
		]),
		runScenario: vi.fn().mockResolvedValue({ runId: "run-123" }),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: test utility cast
	Reflect.deleteProperty((globalThis as any).window, "api");
});

describe("HubLibrary", () => {
	it("liste les scénarios", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		expect(
			await screen.findByText("Parcours de connexion"),
		).toBeInTheDocument();
		expect(screen.getByText("Achat billet")).toBeInTheDocument();
	});
	it("lance un scénario et navigue vers /run/:runId", async () => {
		render(
			<MemoryRouter>
				<HubLibrary />
			</MemoryRouter>,
		);
		await screen.findByText("Parcours de connexion");
		const buttons = screen.getAllByRole("button", { name: /lancer/i });
		await userEvent.click(buttons[0]);
		await waitFor(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test utility cast
			expect(window.api.runScenario as any).toHaveBeenCalledWith(
				"login",
				"preprod",
			);
			expect(navigateMock).toHaveBeenCalledWith("/run/run-123");
		});
	});
});
