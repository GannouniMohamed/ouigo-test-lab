import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewScenario from "../../src/renderer/screens/NewScenario";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

const runScenario = vi.fn().mockResolvedValue({ runId: "run-9" });

beforeEach(() => {
	navigateMock.mockReset();
	runScenario.mockReset();
	runScenario.mockResolvedValue({ runId: "run-9" });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listEnvironments: vi.fn().mockResolvedValue([]),
		listTunnels: vi.fn().mockResolvedValue([
			{
				id: "general",
				projectId: "default",
				name: "Général",
				order: 0,
				color: "",
				description: "",
				createdAt: "2026-06-24T00:00:00Z",
			},
		]),
		startRecording: vi.fn().mockResolvedValue({ recordingId: "rec-1" }),
		stopRecording: vi.fn().mockResolvedValue({
			id: "scn-1",
			projectId: "p1",
			tunnelId: "t1",
			name: "Parcours",
			platform: "web",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "parcours.spec.ts",
			createdAt: "2026-06-24T00:00:00Z",
			lastRun: { status: "never" },
		}),
		runScenario,
	} as unknown as typeof window.api;
	useAppStore.setState({ activeProjectId: "default" });
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
	useAppStore.setState({ activeProjectId: "", firstRunScenarioId: null });
});

describe("NewScenario", () => {
	it("démarre puis arrête l'enregistrement et lance l'auto-run", async () => {
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(window.api.startRecording).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Parcours",
					browser: "chromium",
					projectId: "default",
					tunnelId: "general",
				}),
			),
		);
		await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
		await waitFor(() => {
			expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1");
			expect(navigateMock).toHaveBeenCalledWith("/run/run-9", {
				state: { auto: true },
			});
		});
	});

	it("arrêter déclenche auto-run et navigue vers LiveRun en mode AUTO", async () => {
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
		await waitFor(() => {
			expect(runScenario).toHaveBeenCalledWith(
				"p1",
				"t1",
				"scn-1",
				expect.any(String),
			);
			expect(navigateMock).toHaveBeenCalledWith("/run/run-9", {
				state: { auto: true },
			});
		});
		expect(useAppStore.getState().firstRunScenarioId).toBe("scn-1");
	});

	it("n'affiche aucun sélecteur d'environnement et montre le bandeau hérité", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue([
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "https://preprod.example.com",
					variables: {},
				},
			]);
		useAppStore.setState({
			activeProjectId: "default",
			activeEnvByProject: { default: "preprod" },
		});
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await screen.findByText("Général");
		// No env selector (combobox) labelled "Environnement".
		expect(screen.queryByLabelText(/environnement/i)).not.toBeInTheDocument();
		// The inherited-env read-only banner is shown with the project's env label.
		await waitFor(() =>
			expect(screen.getByText(/hérité du projet/i)).toBeInTheDocument(),
		);
		expect(screen.getByText("Préprod")).toBeInTheDocument();
	});

	it("retombe sur « Local » quand aucun env n'est hérité", async () => {
		useAppStore.setState({
			activeProjectId: "default",
			activeEnvByProject: {},
		});
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await screen.findByText("Général");
		expect(screen.getByText(/hérité du projet/i)).toBeInTheDocument();
		expect(screen.getByText("Local")).toBeInTheDocument();
	});
});
