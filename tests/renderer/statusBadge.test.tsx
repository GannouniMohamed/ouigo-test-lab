import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../../src/renderer/components/StatusBadge";

describe("StatusBadge", () => {
	it("affiche 'Réussi' pour le statut passed", () => {
		render(<StatusBadge status="passed" />);
		expect(screen.getByText("Réussi")).toBeInTheDocument();
	});

	it("affiche 'Échec' pour le statut failed", () => {
		render(<StatusBadge status="failed" />);
		expect(screen.getByText("Échec")).toBeInTheDocument();
	});

	it("affiche 'Jamais exécuté' pour le statut never", () => {
		render(<StatusBadge status="never" />);
		expect(screen.getByText("Jamais exécuté")).toBeInTheDocument();
	});
});
