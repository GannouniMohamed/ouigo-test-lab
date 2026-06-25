import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RunOptionsModal from "../../src/renderer/components/RunOptionsModal";
import type { Environment } from "../../src/shared/types";

const environments: Environment[] = [
	{ id: "acc-a", label: "Préprod", baseURL: "https://x", variables: {} },
];

function renderModal(onConfirm = vi.fn()) {
	render(
		<RunOptionsModal
			scenarioName="Parcours"
			environments={environments}
			defaultEnvId="acc-a"
			onCancel={() => {}}
			onConfirm={onConfirm}
		/>,
	);
	return onConfirm;
}

describe("RunOptionsModal", () => {
	it("n'affiche pas de sélecteur d'env mais un bandeau hérité avec le libellé résolu", () => {
		renderModal();
		// No env <select>/combobox anymore — env is inherited, read-only.
		expect(screen.queryByRole("combobox")).toBeNull();
		const banner = screen.getByText(/hérité du projet/i);
		expect(banner).toBeInTheDocument();
		expect(banner.textContent).toContain("Préprod");
	});

	it("retombe sur 'Local' quand l'env hérité est introuvable", () => {
		render(
			<RunOptionsModal
				scenarioName="Parcours"
				environments={environments}
				defaultEnvId="unknown"
				onCancel={() => {}}
				onConfirm={vi.fn()}
			/>,
		);
		expect(screen.getByText(/hérité du projet/i).textContent).toContain(
			"Local",
		);
	});

	it("par défaut: un seul lancement, séquentiel, et l'option Mode d'exécution est masquée", () => {
		const onConfirm = renderModal();
		// Execution toggle only appears when repeating.
		expect(screen.queryByText("Séquentiel")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /Démarrer/ }));
		expect(onConfirm).toHaveBeenCalledWith("acc-a", {
			headed: true,
			repeat: 1,
			execution: "sequential",
		});
	});

	it("augmente le nombre de lancements et révèle le choix d'exécution", () => {
		const onConfirm = renderModal();
		const plus = screen.getByRole("button", { name: "Plus" });
		fireEvent.click(plus); // 2
		fireEvent.click(plus); // 3
		// Now the execution choice is visible; pick Parallèle.
		fireEvent.click(screen.getByRole("button", { name: /Parallèle/ }));
		fireEvent.click(screen.getByRole("button", { name: /Démarrer/ }));
		expect(onConfirm).toHaveBeenCalledWith("acc-a", {
			headed: true,
			repeat: 3,
			execution: "parallel",
		});
	});

	it("borne le nombre de lancements à au moins 1", () => {
		renderModal();
		const minus = screen.getByRole("button", { name: "Moins" });
		// Already at 1 → the decrement button is disabled.
		expect(minus).toBeDisabled();
	});

	it("borne le nombre de lancements à 20 au maximum", () => {
		renderModal();
		const input = screen.getByRole("spinbutton", {
			name: /Nombre de lancements/i,
		}) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "99" } });
		expect(input.value).toBe("20");
		const plus = screen.getByRole("button", { name: "Plus" });
		expect(plus).toBeDisabled();
	});

	it("conserve l'env hérité dans onConfirm en mode Invisible", () => {
		const onConfirm = renderModal();
		fireEvent.click(screen.getByRole("button", { name: /Invisible/ }));
		fireEvent.click(screen.getByRole("button", { name: /Démarrer/ }));
		expect(onConfirm).toHaveBeenCalledWith("acc-a", {
			headed: false,
			repeat: 1,
			execution: "sequential",
		});
	});
});
