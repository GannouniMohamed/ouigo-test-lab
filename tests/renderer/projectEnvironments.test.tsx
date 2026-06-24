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
