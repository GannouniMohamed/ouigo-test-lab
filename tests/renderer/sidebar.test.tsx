import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "../../src/renderer/components/Sidebar";

describe("Sidebar", () => {
	it("affiche les 5 items de navigation", () => {
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Scénarios")).toBeInTheDocument();
		expect(screen.getByText("Exéc.")).toBeInTheDocument();
		expect(screen.getByText("Rapports")).toBeInTheDocument();
		expect(screen.getByText("IA")).toBeInTheDocument();
		expect(screen.getByText("Projets")).toBeInTheDocument();
	});
	it("affiche Projets en premier", () => {
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		const labels = screen
			.getAllByText(/Projets|Scénarios|Exéc\.|Rapports/)
			.map((n) => n.textContent);
		expect(labels.indexOf("Projets")).toBeLessThan(labels.indexOf("Scénarios"));
	});
	it("désactive l'item IA", () => {
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		const ia = screen.getByText("IA").closest("[aria-disabled]");
		expect(ia).toHaveAttribute("aria-disabled", "true");
		expect(ia).toHaveAttribute("title", "Bientôt");
	});
});
