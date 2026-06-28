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

// #36 fix: mock returns steps: []
const runScenario = vi.fn().mockResolvedValue({ runId: "run-9", steps: [] });

beforeEach(() => {
	navigateMock.mockReset();
	runScenario.mockReset();
	runScenario.mockResolvedValue({ runId: "run-9", steps: [] });
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
		installApp: vi.fn().mockResolvedValue({ ok: true }),
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
		openExternal: vi.fn(),
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
			expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1", undefined);
			// #36 fix: assert includes steps: []
			expect(navigateMock).toHaveBeenCalledWith("/run/run-9", {
				state: { auto: true, steps: [] },
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
			// #36 fix: assert includes steps: []
			expect(navigateMock).toHaveBeenCalledWith("/run/run-9", {
				state: { auto: true, steps: [] },
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

	it("startRecording échoue → message d'erreur affiché, bouton réutilisable", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.startRecording = vi
			.fn()
			.mockRejectedValue(new Error("Maestro Studio introuvable"));
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
			expect(
				screen.getByText(/maestro studio introuvable/i),
			).toBeInTheDocument(),
		);
		// pas bloqué sur « Démarrage… » : le bouton revient
		expect(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		).toBeInTheDocument();
	});

	it("stopRecording échoue → message affiché, pas de navigation", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = vi
			.fn()
			.mockRejectedValue(new Error("Aucun flow détecté"));
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
		await waitFor(() =>
			expect(screen.getByText(/aucun flow détecté/i)).toBeInTheDocument(),
		);
		expect(navigateMock).not.toHaveBeenCalled();
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

	function envWithFirebaseApp() {
		return [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://preprod.example.com",
				variables: {},
				app: {
					appId: "com.ouigo.app",
					source: "firebase" as const,
					firebase: {
						projectNumber: "1",
						firebaseAppId: "1:1:android:x",
						serviceAccountKeyPath: "/k.json",
					},
				},
			},
		];
	}

	async function pickMobile() {
		const mobileCard = screen.getByText("Mobile").closest("button");
		if (!mobileCard) throw new Error("carte Mobile introuvable");
		await userEvent.click(mobileCard);
	}

	async function startMobileRecording() {
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
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
	}

	// #14: escape hatch test
	it("sans app → le message inclut un bouton vers /projects/:id/environments", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue([
				{ id: "preprod", label: "Préprod", baseURL: "", variables: {} },
			]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi.fn().mockResolvedValue([]);
		useAppStore.setState({
			activeProjectId: "proj-1",
			activeEnvByProject: {},
		});
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await screen.findByText("Général");
		await pickMobile();
		const link = await screen.findByRole("button", {
			name: /configurer l'environnement/i,
		});
		await userEvent.click(link);
		expect(navigateMock).toHaveBeenCalledWith("/projects/proj-1/environments");
	});

	it("sans app → bouton Démarrer a un title et aria-describedby", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue([
				{ id: "preprod", label: "Préprod", baseURL: "", variables: {} },
			]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi.fn().mockResolvedValue([]);
		useAppStore.setState({
			activeProjectId: "proj-1",
			activeEnvByProject: {},
		});
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await screen.findByText("Général");
		await pickMobile();
		const startBtn = screen.getByRole("button", {
			name: /démarrer l'enregistrement/i,
		});
		expect(startBtn).toBeDisabled();
		expect(startBtn).toHaveAttribute("aria-describedby", "no-app-hint");
		// #14 minor: also assert the title attribute value
		expect(startBtn).toHaveAttribute(
			"title",
			"Configure l'App ID dans Environnements pour activer l'enregistrement mobile",
		);
	});

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

	// Updated: new UX — click "Terminer l'enregistrement" then "Lancer"
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
		// New UX: click "Terminer l'enregistrement" (no paste needed — uses clipboard)
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		// After stop, "Lancer" button appears — click it to run
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /lancer/i }),
			).toBeInTheDocument(),
		);
		await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
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

	it("env firebase → « Installer l'app (Firebase) » appelle installApp + message succès", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue(envWithFirebaseApp());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi
			.fn()
			.mockResolvedValue([bootedDevice]);
		const installApp = vi.fn().mockResolvedValue({ ok: true });
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.installApp = installApp;
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
			screen.getByRole("button", { name: /installer l'app \(firebase\)/i }),
		);
		await waitFor(() =>
			expect(installApp).toHaveBeenCalledWith(
				"default",
				"preprod",
				"emulator-5554",
			),
		);
		await waitFor(() =>
			expect(screen.getByText(/app installée/i)).toBeInTheDocument(),
		);
	});

	// Updated: new UX — "Terminer l'enregistrement" + optional paste via "Coller manuellement"
	it("mobile : après démarrage, colle le parcours puis crée le scénario", async () => {
		// Arrange: env mobile + un appareil démarré
		const stop = vi.fn().mockResolvedValue({
			id: "resa",
			projectId: "p1",
			tunnelId: "general",
			name: "Resa",
			platform: "mobile",
			defaultEnvironmentId: "preprod",
			specFile: "resa.flow.yaml",
		});
		const run = vi.fn().mockResolvedValue({ runId: "r1", steps: [] });
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.startRecording = vi
			.fn()
			.mockResolvedValue({ recordingId: "rec1" });
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = stop;
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.runScenario = run;
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listDevices = vi
			.fn()
			.mockResolvedValue([
				{ id: "emulator-5554", name: "Pixel", state: "booted" },
			]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listEnvironments = vi
			.fn()
			.mockResolvedValue([
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "",
					variables: {},
					app: { appId: "com.ouigo.app", source: "installed" },
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
		// sélectionne Mobile + nomme
		await userEvent.click(await screen.findByText("Mobile"));
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Resa",
		);
		await userEvent.click(
			await screen.findByRole("button", { name: /Démarrer l'enregistrement/i }),
		);

		// New UX: expand "Coller manuellement" and paste
		const collerBtn = await screen.findByRole("button", {
			name: /coller manuellement/i,
		});
		await userEvent.click(collerBtn);
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "appId: x\n---\n- launchApp\n");
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);

		await waitFor(() =>
			expect(stop).toHaveBeenCalledWith("rec1", "appId: x\n---\n- launchApp"),
		);
		// After success, click Lancer to run
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /lancer/i }),
			).toBeInTheDocument(),
		);
		await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
		await waitFor(() => expect(run).toHaveBeenCalled());
	});

	it("env installed → pas de bouton « Installer l'app (Firebase) »", async () => {
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
		expect(
			screen.queryByRole("button", {
				name: /installer l'app \(firebase\)/i,
			}),
		).not.toBeInTheDocument();
	});

	// #17: Studio URL + format hint
	it("enregistrement mobile actif → affiche le hint Studio et le bouton Terminer", async () => {
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
			"Test",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		// Hint visible (mentions Maestro Studio)
		expect(
			await screen.findByText(/fenêtre Maestro Studio/i),
		).toBeInTheDocument();
		// "Terminer l'enregistrement" button visible
		expect(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		).toBeInTheDocument();
		// "Annuler" button visible
		expect(
			screen.getByRole("button", { name: /annuler/i }),
		).toBeInTheDocument();
	});

	// #17: format warning — now triggered from the manual paste fallback
	it("flow sans appId: → avertissement avant soumission", async () => {
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
			"Test",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		// Expand the manual paste fallback
		const collerBtn = await screen.findByRole("button", {
			name: /coller manuellement/i,
		});
		await userEvent.click(collerBtn);
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "launchApp\n");
		// Warning should appear (no appId: in content) — the error variant
		const warnings = await screen.findAllByText(/doit commencer par/i);
		expect(warnings.length).toBeGreaterThanOrEqual(1);
	});

	// Task 3 — new tests: embedded Studio UX

	it("mobile Terminer avec paste vide → stopRecording appelé avec (recordingId, undefined)", async () => {
		await startMobileRecording();
		// Click "Terminer l'enregistrement" with empty paste box
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1", undefined),
		);
	});

	it("confirmer avant run : après stop réussi, runScenario pas encore appelé; bouton Lancer visible", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = vi.fn().mockResolvedValue({
			id: "scn-m",
			projectId: "p1",
			tunnelId: "t1",
			name: "Mon Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "s.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		});
		await startMobileRecording();
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		// Wait for stop to complete
		await waitFor(() => expect(window.api.stopRecording).toHaveBeenCalled());
		// runScenario should NOT have been called yet
		expect(runScenario).not.toHaveBeenCalled();
		// "Lancer" button should be present
		const lancerBtn = await screen.findByRole("button", { name: /lancer/i });
		expect(lancerBtn).toBeInTheDocument();
		// Clicking "Lancer" should call runScenario and navigate
		await userEvent.click(lancerBtn);
		await waitFor(() => expect(runScenario).toHaveBeenCalled());
		await waitFor(() => expect(navigateMock).toHaveBeenCalled());
	});

	it("fallback manuel : paste avec contenu → Terminer passe pastedFlow", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = vi.fn().mockResolvedValue({
			id: "scn-m",
			projectId: "p1",
			tunnelId: "t1",
			name: "Mon Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "s.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		});
		await startMobileRecording();
		// Expand manual paste fallback and type content
		const collerBtn = await screen.findByRole("button", {
			name: /coller manuellement/i,
		});
		await userEvent.click(collerBtn);
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "appId: com.ouigo.app\n---\n- launchApp\n");
		// Click "Terminer l'enregistrement" — should pass the typed content (trimmed)
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(window.api.stopRecording).toHaveBeenCalledWith(
				"rec-1",
				"appId: com.ouigo.app\n---\n- launchApp",
			),
		);
	});

	it("stopRecording rejette avec /étape/ → message affiché et fallback manuel révélé", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.stopRecording = vi
			.fn()
			.mockRejectedValue(
				new Error(
					"Aucune étape détectée — enregistre dans le Studio, clique Copy, puis Terminer.",
				),
			);
		await startMobileRecording();
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(screen.getByText(/aucune étape/i)).toBeInTheDocument(),
		);
		// The manual paste fallback textarea should be auto-revealed
		expect(screen.getByLabelText("Parcours enregistré")).toBeInTheDocument();
	});

	// #18: preserve pastedFlow on run failure (updated: via Terminer → Lancer flow)
	it("run échoue → pastedFlow conservé, message d'erreur affiché", async () => {
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
			name: "Mon Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "s.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.runScenario = vi
			.fn()
			.mockRejectedValue(new Error("Appareil déconnecté"));
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
			"Test",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		// Expand fallback, paste content
		const collerBtn = await screen.findByRole("button", {
			name: /coller manuellement/i,
		});
		await userEvent.click(collerBtn);
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "appId: x\n---\n- launchApp\n");
		// Terminer
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		// Wait for stop; then click Lancer
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /lancer/i }),
			).toBeInTheDocument(),
		);
		await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
		await waitFor(() =>
			expect(screen.getByText(/appareil déconnecté/i)).toBeInTheDocument(),
		);
		// pastedFlow should still be in the textarea (shown in retry state)
		expect(screen.getByLabelText("Parcours enregistré")).toHaveValue(
			"appId: x\n---\n- launchApp\n",
		);
	});

	// #18: retry button after run failure (updated: Terminer → Lancer → run fails → retry)
	it("run échoue → bouton « Réessayer l'exécution » visible et relance le run", async () => {
		const runMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("Appareil déconnecté"))
			.mockResolvedValueOnce({ runId: "run-retry", steps: [] });
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
			id: "scn-retry",
			projectId: "p1",
			tunnelId: "t1",
			name: "Mon Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "s.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.runScenario = runMock;
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
			"Test",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() => expect(window.api.startRecording).toHaveBeenCalled());
		// Expand fallback, paste content
		const collerBtn = await screen.findByRole("button", {
			name: /coller manuellement/i,
		});
		await userEvent.click(collerBtn);
		const area = await screen.findByLabelText("Parcours enregistré");
		await userEvent.type(area, "appId: x\n---\n- launchApp\n");
		// Terminer
		await userEvent.click(
			screen.getByRole("button", { name: /terminer l'enregistrement/i }),
		);
		// Wait for Lancer button then click it
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /lancer/i }),
			).toBeInTheDocument(),
		);
		// pastedFlow still present in the fallback textarea (shown in Lancer state)
		await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
		// Wait for run failure state — retry button should appear
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /réessayer l'exécution/i }),
			).toBeInTheDocument(),
		);
		// pastedFlow still present
		expect(screen.getByLabelText("Parcours enregistré")).toHaveValue(
			"appId: x\n---\n- launchApp\n",
		);
		// Click retry — should call runScenario again
		await userEvent.click(
			screen.getByRole("button", { name: /réessayer l'exécution/i }),
		);
		await waitFor(() => expect(runMock).toHaveBeenCalledTimes(2));
		// On success, navigate to the run
		await waitFor(() =>
			expect(navigateMock).toHaveBeenCalledWith("/run/run-retry", {
				state: { auto: true, steps: [] },
			}),
		);
	});
});
