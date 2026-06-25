import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BatchRun from "../../src/renderer/screens/BatchRun";
import type { BatchReport } from "../../src/shared/types";

const batch: BatchReport = {
	batchId: "batch-1",
	scenarioId: "login",
	scenarioName: "Parcours de connexion",
	projectId: "distribution",
	tunnelId: "general",
	environmentId: "acc-a",
	environmentLabel: "Préprod",
	mode: "visible",
	execution: "sequential",
	total: 3,
	startedAt: "2026-06-24T10:00:00Z",
	finishedAt: "2026-06-24T10:02:00Z",
	items: [
		{ index: 1, runId: "run-a", status: "passed", durationMs: 1000 },
		{ index: 2, runId: "run-b", status: "failed", durationMs: 3000 },
		{ index: 3, runId: "run-c", status: "passed", durationMs: 2000 },
	],
};

beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		getBatch: vi.fn().mockResolvedValue(batch),
		onBatchEvent: vi.fn().mockReturnValue(() => {}),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

function renderAt() {
	return render(
		<MemoryRouter initialEntries={["/batch/batch-1"]}>
			<Routes>
				<Route path="/batch/:batchId" element={<BatchRun />} />
				<Route path="/report/:runId" element={<div>RAPPORT</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("BatchRun", () => {
	it("affiche le résumé KPI (X/N réussis, durées min/moy/max)", async () => {
		renderAt();
		// 2/3 réussis, 1 échec.
		expect(await screen.findByText("2/3")).toBeInTheDocument();
		expect(screen.getByText("réussis")).toBeInTheDocument();
		expect(screen.getByText("durée moyenne")).toBeInTheDocument();
		// Durations show both in the KPI band and on item cards.
		expect(screen.getAllByText("1.0s").length).toBeGreaterThanOrEqual(1); // min
		expect(screen.getAllByText("2.0s").length).toBeGreaterThanOrEqual(1); // moy
		expect(screen.getAllByText("3.0s").length).toBeGreaterThanOrEqual(1); // max
	});

	it("affiche une carte par itération avec accès au détail", async () => {
		renderAt();
		expect(await screen.findByTestId("batch-item-1")).toBeInTheDocument();
		expect(screen.getByTestId("batch-item-2")).toBeInTheDocument();
		expect(screen.getByTestId("batch-item-3")).toBeInTheDocument();
		// Each finished run exposes a drill-down link.
		expect(
			screen.getAllByRole("button", { name: "Voir le détail" }),
		).toHaveLength(3);
	});

	it("navigue vers le rapport d'un run au clic sur Voir le détail", async () => {
		const { fireEvent } = await import("@testing-library/react");
		renderAt();
		await screen.findByTestId("batch-item-1");
		fireEvent.click(
			screen.getAllByRole("button", { name: "Voir le détail" })[0],
		);
		expect(await screen.findByText("RAPPORT")).toBeInTheDocument();
	});
});
