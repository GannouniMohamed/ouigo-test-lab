import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "../../src/renderer/components/TitleBar";

const controls = {
	minimize: vi.fn(),
	maximize: vi.fn(),
	close: vi.fn(),
};

function setPlatform(platform: string): void {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = { platform, windowControls: controls };
}

beforeEach(() => {
	controls.minimize.mockReset();
	controls.maximize.mockReset();
	controls.close.mockReset();
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

describe("TitleBar", () => {
	it("affiche le titre de la page courante", () => {
		setPlatform("win32");
		render(
			<MemoryRouter initialEntries={["/scenarios"]}>
				<TitleBar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Hub de tests E2E")).toBeInTheDocument();
	});

	it("Windows: les contrôles de fenêtre appellent les bons IPC", async () => {
		setPlatform("win32");
		render(
			<MemoryRouter initialEntries={["/scenarios"]}>
				<TitleBar />
			</MemoryRouter>,
		);
		await userEvent.click(screen.getByRole("button", { name: "Réduire" }));
		await userEvent.click(screen.getByRole("button", { name: "Agrandir" }));
		await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
		expect(controls.minimize).toHaveBeenCalledOnce();
		expect(controls.maximize).toHaveBeenCalledOnce();
		expect(controls.close).toHaveBeenCalledOnce();
	});

	it("macOS: pas de contrôles custom (feux natifs)", () => {
		setPlatform("darwin");
		render(
			<MemoryRouter initialEntries={["/report/run-1"]}>
				<TitleBar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Rapport d'exécution")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Fermer" }),
		).not.toBeInTheDocument();
	});

	it("affiche le titre Projets pour /projects", () => {
		setPlatform("darwin");
		render(
			<MemoryRouter initialEntries={["/projects"]}>
				<TitleBar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Projets")).toBeInTheDocument();
	});
});
