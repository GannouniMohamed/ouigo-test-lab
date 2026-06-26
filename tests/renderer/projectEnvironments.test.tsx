import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectEnvironments from "../../src/renderer/screens/ProjectEnvironments";

const project = {
	id: "ouigo",
	name: "Ouigo.com",
	description: "",
	environments: [
		{
			id: "preprod",
			label: "Préprod",
			baseURL: "https://preprod.ouigo.com",
			variables: {},
		},
		{
			id: "recette",
			label: "Recette",
			baseURL: "https://recette.ouigo.com",
			variables: {},
		},
	],
	createdAt: "2026-06-24T00:00:00Z",
};

beforeEach(() => {
	window.api = {
		getProject: vi.fn().mockResolvedValue(project),
		saveEnvironment: vi.fn().mockResolvedValue(undefined),
		deleteEnvironment: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
});
afterEach(() => vi.clearAllMocks());

function renderAt() {
	render(
		<MemoryRouter initialEntries={["/projects/ouigo/environments"]}>
			<Routes>
				<Route
					path="/projects/:id/environments"
					element={<ProjectEnvironments />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("ProjectEnvironments", () => {
	it("liste les environnements du projet", async () => {
		renderAt();
		expect(await screen.findByDisplayValue("Préprod")).toBeTruthy();
		expect(screen.getByDisplayValue("https://recette.ouigo.com")).toBeTruthy();
	});

	it("enregistre une URL modifiée via saveEnvironment (même id)", async () => {
		renderAt();
		const url = (await screen.findByDisplayValue(
			"https://preprod.ouigo.com",
		)) as HTMLInputElement;
		fireEvent.change(url, { target: { value: "https://pp.ouigo.com" } });
		fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
		await waitFor(() =>
			expect(
				window.api.saveEnvironment as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith(
				"ouigo",
				expect.objectContaining({
					id: "preprod",
					baseURL: "https://pp.ouigo.com",
				}),
			),
		);
	});
});

describe("ProjectEnvironments — application mobile", () => {
	const savedArg = () =>
		(window.api.saveEnvironment as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0][1];

	function singleEnvProject(app?: unknown) {
		return {
			id: "ouigo",
			name: "Ouigo.com",
			description: "",
			environments: [
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "https://preprod.ouigo.com",
					variables: {},
					...(app ? { app } : {}),
				},
			],
			createdAt: "2026-06-24T00:00:00Z",
		};
	}

	it("active l'app, saisit l'appId et l'enregistre (source installed)", async () => {
		window.api.getProject = vi.fn().mockResolvedValue(singleEnvProject());
		renderAt();
		await screen.findByDisplayValue("Préprod");
		fireEvent.click(screen.getByLabelText(/application mobile/i));
		fireEvent.change(screen.getByPlaceholderText(/com\.exemple\.app/i), {
			target: { value: "com.ouigo.app" },
		});
		fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
		await waitFor(() =>
			expect(
				window.api.saveEnvironment as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith(
				"ouigo",
				expect.objectContaining({
					id: "preprod",
					app: { appId: "com.ouigo.app", source: "installed" },
				}),
			),
		);
	});

	it("source firebase → saisit et enregistre la config firebase", async () => {
		window.api.getProject = vi.fn().mockResolvedValue(singleEnvProject());
		renderAt();
		await screen.findByDisplayValue("Préprod");
		fireEvent.click(screen.getByLabelText(/application mobile/i));
		fireEvent.click(screen.getByRole("radio", { name: /firebase/i }));
		fireEvent.change(screen.getByPlaceholderText(/com\.exemple\.app/i), {
			target: { value: "com.ouigo.app" },
		});
		fireEvent.change(screen.getByPlaceholderText(/numéro de projet/i), {
			target: { value: "123" },
		});
		fireEvent.change(screen.getByPlaceholderText(/android/i), {
			target: { value: "1:123:android:abc" },
		});
		fireEvent.change(screen.getByPlaceholderText(/compte de service/i), {
			target: { value: "/k.json" },
		});
		fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
		await waitFor(() =>
			expect(savedArg()).toEqual(
				expect.objectContaining({
					app: {
						appId: "com.ouigo.app",
						source: "firebase",
						firebase: {
							projectNumber: "123",
							firebaseAppId: "1:123:android:abc",
							serviceAccountKeyPath: "/k.json",
						},
					},
				}),
			),
		);
	});

	it("désactiver l'app supprime app de l'environnement", async () => {
		window.api.getProject = vi
			.fn()
			.mockResolvedValue(
				singleEnvProject({ appId: "com.ouigo.app", source: "installed" }),
			);
		renderAt();
		await screen.findByDisplayValue("Préprod");
		// la case est déjà cochée (app présente) → on décoche
		fireEvent.click(screen.getByLabelText(/application mobile/i));
		fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
		await waitFor(() => expect(savedArg().app).toBeUndefined());
	});
});
