import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Projects from "../../src/renderer/screens/Projects";
import { useAppStore } from "../../src/renderer/store";

const initial = [
	{
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [
			{ id: "preprod", label: "Préprod", baseURL: "https://p", variables: {} },
		],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listProjects: vi.fn().mockResolvedValue(initial),
		createProject: vi.fn().mockResolvedValue({
			id: "web",
			name: "Site Web",
			description: "",
			environments: [],
			createdAt: "2026-06-24T00:00:00Z",
		}),
		updateProject: vi.fn().mockResolvedValue(undefined),
		deleteProject: vi.fn().mockResolvedValue(undefined),
		saveEnvironment: vi.fn().mockResolvedValue(undefined),
		deleteEnvironment: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects: initial, activeProjectId: "default" });
});
afterEach(() => {
	vi.clearAllMocks();
});

describe("Projects screen", () => {
	it("liste les projets existants", async () => {
		render(
			<MemoryRouter>
				<Projects />
			</MemoryRouter>,
		);
		expect(await screen.findByText("Projet par défaut")).toBeTruthy();
	});
	it("crée un projet via le formulaire", async () => {
		render(
			<MemoryRouter>
				<Projects />
			</MemoryRouter>,
		);
		fireEvent.change(screen.getByPlaceholderText(/nom du projet/i), {
			target: { value: "Site Web" },
		});
		fireEvent.click(screen.getByRole("button", { name: /créer le projet/i }));
		await waitFor(() =>
			expect(
				window.api.createProject as unknown as ReturnType<typeof vi.fn>,
			).toHaveBeenCalledWith({ name: "Site Web", description: "" }),
		);
	});
});
