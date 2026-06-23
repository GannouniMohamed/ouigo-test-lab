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

beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		getReport: vi.fn().mockResolvedValue(failed),
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
});
