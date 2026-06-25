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

// A six-item snapshot mixing every status, used for the iso-maquette KPI band
// + run-card assertions (some passed, one failed, one running, some pending).
const batch6: BatchReport = {
	batchId: "batch-6",
	scenarioId: "login",
	scenarioName: "Parcours de connexion",
	projectId: "distribution",
	tunnelId: "general",
	environmentId: "acc-a",
	environmentLabel: "Préprod",
	mode: "invisible",
	execution: "parallel",
	total: 6,
	startedAt: "2026-06-24T10:00:00Z",
	items: [
		{ index: 1, runId: "run-a", status: "passed", durationMs: 1000 },
		{ index: 2, runId: "run-b", status: "passed", durationMs: 2000 },
		{ index: 3, runId: "run-c", status: "failed", durationMs: 3000 },
		{ index: 4, runId: "run-d", status: "running" },
		{ index: 5, status: "pending" },
		{ index: 6, status: "pending" },
	],
};

let currentBatch: BatchReport = batch;

beforeEach(() => {
	currentBatch = batch;
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		getBatch: vi.fn().mockImplementation(() => Promise.resolve(currentBatch)),
		onBatchEvent: vi.fn().mockReturnValue(() => {}),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

function renderBatch(id: string) {
	return render(
		<MemoryRouter initialEntries={[`/batch/${id}`]}>
			<Routes>
				<Route path="/batch/:batchId" element={<BatchRun />} />
				<Route path="/report/:runId" element={<div>RAPPORT</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderAt() {
	return renderBatch("batch-1");
}

describe("BatchRun", () => {
	it("affiche le résumé KPI (X/N réussis, durées min/moy/max)", async () => {
		renderAt();
		// 2/3 réussis, 1 échec.
		expect(await screen.findByText("2/3")).toBeInTheDocument();
		expect(screen.getByText("runs réussis")).toBeInTheDocument();
		expect(screen.getByText("échecs")).toBeInTheDocument();
		// MIN / MOYENNE / MAX KPI labels.
		expect(screen.getByText("MIN")).toBeInTheDocument();
		expect(screen.getByText("MOYENNE")).toBeInTheDocument();
		expect(screen.getByText("MAX")).toBeInTheDocument();
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

	it("rend le bandeau KPI et l'état de chaque run sur un lot mixte de 6", async () => {
		currentBatch = batch6;
		renderBatch("batch-6");
		// Donut: 2 passed out of 6 total.
		expect(await screen.findByText("2/6")).toBeInTheDocument();
		expect(screen.getByText("runs réussis")).toBeInTheDocument();
		// 1 échec.
		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("échecs")).toBeInTheDocument();
		// One card per run, with the right status label.
		for (let i = 1; i <= 6; i++) {
			expect(screen.getByTestId(`batch-item-${i}`)).toBeInTheDocument();
		}
		expect(screen.getByText("Échec")).toBeInTheDocument();
		// "En cours" appears both as the header status and the running run badge.
		expect(screen.getAllByText("En cours").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Réussi")).toHaveLength(2);
		expect(screen.getAllByText("En attente")).toHaveLength(2);
		// MIN / MOYENNE / MAX still present even with unfinished runs.
		expect(screen.getByText("MIN")).toBeInTheDocument();
		expect(screen.getByText("MOYENNE")).toBeInTheDocument();
		expect(screen.getByText("MAX")).toBeInTheDocument();
	});

	it("affiche — pour les durées quand aucun run n'est terminé", async () => {
		currentBatch = {
			...batch6,
			items: [
				{ index: 1, runId: "run-a", status: "running" },
				{ index: 2, status: "pending" },
			],
			total: 2,
		};
		renderBatch("batch-6");
		// 0 passed / 2 total, no NaN, durations show the em dash.
		expect(await screen.findByText("0/2")).toBeInTheDocument();
		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
	});
});
