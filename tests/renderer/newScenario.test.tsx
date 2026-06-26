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
		listDevices: vi.fn().mockResolvedValue([]),
		startDevice: vi.fn().mockResolvedValue({ ok: true }),
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

	it("affiche le 1er env du projet (pas « Local ») quand aucun n'est sélectionné", async () => {
		// Fresh project: nothing in activeEnvByProject, but the project has envs.
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
				{
					id: "recette",
					label: "Recette",
					baseURL: "https://recette.example.com",
					variables: {},
				},
			]);
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
		// Banner shows the project's first env, not the literal "Local".
		await waitFor(() =>
			expect(screen.getByText("Préprod")).toBeInTheDocument(),
		);
		expect(screen.queryByText("Local")).not.toBeInTheDocument();

		// And recording starts against that inherited env id.
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(window.api.startRecording).toHaveBeenCalledWith(
				expect.objectContaining({ environmentId: "preprod" }),
			),
		);
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

describe("NewScenario — mobile", () => {
	const bootedDevice = {
		id: "emulator-5554",
		name: "Pixel 6 — API 33",
		kind: "emulator" as const,
		state: "booted" as const,
	};

	function envWithApp() {
		return [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://preprod.example.com",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" as const },
			},
		];
	}

	async function pickMobile() {
		const mobileCard = screen.getByText("Mobile").closest("button");
		if (!mobileCard) throw new Error("carte Mobile introuvable");
		await userEvent.click(mobileCard);
	}

	it("sans app sur l'env → démarrage bloqué avec un message", async () => {
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
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi
			.fn()
			.mockResolvedValue([bootedDevice]);
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
		await pickMobile();
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		expect(
			screen.getByText(/application mobile sur l'environnement/i),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		).toBeDisabled();
	});

	it("app + appareil → startRecording reçoit platform mobile + deviceId", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue(envWithApp());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi
			.fn()
			.mockResolvedValue([bootedDevice]);
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
		await pickMobile();
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
					platform: "mobile",
					deviceId: "emulator-5554",
					environmentId: "preprod",
				}),
			),
		);
	});

	it("arrêter un enregistrement mobile → runScenario reçoit deviceId", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue(envWithApp());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi
			.fn()
			.mockResolvedValue([bootedDevice]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = vi.fn().mockResolvedValue({
			id: "scn-m",
			projectId: "p1",
			tunnelId: "t1",
			name: "Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "parcours.flow.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		});
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
		await pickMobile();
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
		await waitFor(() =>
			expect(runScenario).toHaveBeenCalledWith(
				"p1",
				"t1",
				"scn-m",
				expect.any(String),
				{ deviceId: "emulator-5554" },
			),
		);
	});

	it("échec de démarrage de l'émulateur (ok:false) → message affiché, bouton réutilisable", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue(envWithApp());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi.fn().mockResolvedValue([]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.startDevice = vi
			.fn()
			.mockResolvedValue({ ok: false, error: "Aucun AVD configuré" });
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
		await pickMobile();
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer un émulateur/i }),
		);
		await waitFor(() =>
			expect(screen.getByText(/Aucun AVD configuré/i)).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: /démarrer un émulateur/i }),
		).not.toBeDisabled();
	});

	it("startDevice rejette → message générique, pas de crash", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue(envWithApp());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi.fn().mockResolvedValue([]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.startDevice = vi
			.fn()
			.mockRejectedValue(new Error("spawn ENOENT"));
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
		await pickMobile();
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer un émulateur/i }),
		);
		await waitFor(() =>
			expect(
				screen.getByText(/impossible de démarrer l'émulateur/i),
			).toBeInTheDocument(),
		);
	});
});
