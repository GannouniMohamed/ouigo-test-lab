import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSwitcher } from "../../src/renderer/components/ProjectSwitcher";
import { useAppStore } from "../../src/renderer/store";

const projects = [
	{
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [],
		createdAt: "2026-06-24T00:00:00Z",
	},
	{
		id: "web",
		name: "Site Web",
		description: "",
		environments: [],
		createdAt: "2026-06-24T00:00:00Z",
	},
];

beforeEach(() => {
	window.api = {
		listProjects: vi.fn().mockResolvedValue(projects),
		listEnvironments: vi.fn().mockResolvedValue([]),
	} as unknown as typeof window.api;
	useAppStore.setState({ projects, activeProjectId: "default" });
});
afterEach(() => {
	localStorage.clear();
});

describe("ProjectSwitcher", () => {
	it("liste les projets et reflète le projet actif", () => {
		render(
			<MemoryRouter>
				<ProjectSwitcher />
			</MemoryRouter>,
		);
		const select = screen.getByLabelText(/projet actif/i) as HTMLSelectElement;
		expect(select.value).toBe("default");
		expect(screen.getByRole("option", { name: "Site Web" })).toBeTruthy();
	});
	it("changer de projet met à jour activeProjectId", async () => {
		render(
			<MemoryRouter>
				<ProjectSwitcher />
			</MemoryRouter>,
		);
		fireEvent.change(screen.getByLabelText(/projet actif/i), {
			target: { value: "web" },
		});
		await waitFor(() =>
			expect(useAppStore.getState().activeProjectId).toBe("web"),
		);
	});
});
