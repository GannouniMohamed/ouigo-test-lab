import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Report from "../../src/renderer/screens/Report";
import type { Report as Rep } from "../../src/shared/types";

const failed: Rep = {
	runId: "run-1",
	scenarioId: "login",
	scenarioName: "Parcours de connexion",
	environmentLabel: "Préprod",
	status: "failed",
	durationMs: 8400,
	startedAt: "2026-06-23T14:31:00Z",
	steps: [
		{ index: 0, title: "Ouvrir la page", status: "passed", durationMs: 1200 },
		{
			index: 1,
			title: "Cliquer Connexion",
			status: "failed",
			durationMs: 3000,
			error: "Élément introuvable : bouton « Connexion »",
			screenshotPath: "/tmp/run-1/artifacts/fail.png",
		},
	],
};

const editable: Rep = {
	...failed,
	projectId: "distribution",
	tunnelId: "general",
	environmentId: "acc-a",
	mode: "visible",
};

const SCENARIO_SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://x');
  await page.getByRole('button', { name: 'Connexion' }).click();
});
`;

beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		getReport: vi.fn().mockResolvedValue(failed),
		getScenarioSpec: vi.fn().mockResolvedValue(SCENARIO_SPEC),
		saveScenarioSpec: vi.fn().mockResolvedValue([]),
		runScenario: vi.fn().mockResolvedValue({ runId: "run-2" }),
		onRunEvent: vi.fn().mockReturnValue(() => {}),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

function renderAt() {
	return render(
		<MemoryRouter initialEntries={["/report/run-1"]}>
			<Routes>
				<Route path="/report/:runId" element={<Report />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("Report", () => {
	it("affiche le statut Échec et la raison", async () => {
		renderAt();
		expect(await screen.findByText("Échec")).toBeInTheDocument();
		expect(screen.getByText(/Élément introuvable/)).toBeInTheDocument();
	});
	it("affiche la capture d'échec", async () => {
		renderAt();
		const img = await screen.findByTestId("failure-screenshot");
		expect(img).toHaveAttribute("src", "file:///tmp/run-1/artifacts/fail.png");
	});
	it("le bloc réparation IA est désactivé", async () => {
		renderAt();
		await screen.findByText("Échec");
		const ai = screen.getByText("Réparation IA").closest("[aria-disabled]");
		expect(ai).toHaveAttribute("aria-disabled", "true");
	});

	it("ne montre pas les actions d'étape sans projectId/tunnelId", async () => {
		renderAt();
		await screen.findByText("Échec");
		expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
	});

	it("Supprimer une étape crée un brouillon (disque intact) et affiche le bandeau", async () => {
		(
			window.api.getReport as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(editable);
		const { fireEvent } = await import("@testing-library/react");
		renderAt();
		await screen.findByText("Échec");
		fireEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[1]);
		// Reads the spec to build the draft; does NOT persist (no saveScenarioSpec).
		expect(window.api.getScenarioSpec).toHaveBeenCalledWith(
			"distribution",
			"general",
			"login",
		);
		expect(window.api.saveScenarioSpec).not.toHaveBeenCalled();
		expect(
			await screen.findByText(/brouillon non enregistré/),
		).toBeInTheDocument();
	});

	it("Ignorer en invisible passe l'étape en 'visible seulement'", async () => {
		(
			window.api.getReport as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(editable);
		const { fireEvent } = await import("@testing-library/react");
		renderAt();
		await screen.findByText("Échec");
		// Open the ignore submenu on the 2nd step, choose "en invisible".
		fireEvent.click(screen.getAllByRole("button", { name: "Ignorer…" })[1]);
		fireEvent.click(
			await screen.findByRole("button", { name: "Ignorer en invisible" }),
		);
		// Ignored in invisible ⇒ runs only in visible ⇒ chip "visible seulement".
		expect(await screen.findByText("visible seulement")).toBeInTheDocument();
		expect(
			await screen.findByText(/brouillon non enregistré/),
		).toBeInTheDocument();
	});

	it("Ignorer en invisible rend l'étape réellement ignorée en invisible (et gardée en visible)", async () => {
		(
			window.api.getReport as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(editable);
		const { fireEvent } = await import("@testing-library/react");
		const { compileSpecForMode } = await import("../../src/shared/spec");
		renderAt();
		await screen.findByText("Échec");
		fireEvent.click(screen.getAllByRole("button", { name: "Ignorer…" })[1]);
		fireEvent.click(
			await screen.findByRole("button", { name: "Ignorer en invisible" }),
		);
		fireEvent.click(await screen.findByRole("button", { name: "Enregistrer" }));
		const savedSpec = (
			window.api.saveScenarioSpec as unknown as ReturnType<typeof vi.fn>
		).mock.calls[0][3] as string;
		// Compiled for INVISIBLE the ignored action must be commented out…
		const invisible = compileSpecForMode(savedSpec, "invisible");
		expect(invisible).toMatch(/\/\/\s*await page\.getByRole\(/);
		// …and still active when run VISIBLE.
		const visible = compileSpecForMode(savedSpec, "visible");
		expect(visible).toMatch(/^\s*await page\.getByRole\(/m);
	});

	it("Enregistrer persiste le brouillon", async () => {
		(
			window.api.getReport as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue(editable);
		const { fireEvent } = await import("@testing-library/react");
		renderAt();
		await screen.findByText("Échec");
		fireEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[1]);
		fireEvent.click(await screen.findByRole("button", { name: "Enregistrer" }));
		expect(window.api.saveScenarioSpec).toHaveBeenCalledWith(
			"distribution",
			"general",
			"login",
			expect.stringContaining("await page.goto('https://x')"),
		);
	});
});
