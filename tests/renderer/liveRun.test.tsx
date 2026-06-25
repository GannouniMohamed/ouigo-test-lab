import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveRun from "../../src/renderer/screens/LiveRun";
import type { RunEvent } from "../../src/shared/types";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

let emit: (e: RunEvent) => void = () => {};

beforeEach(() => {
	navigateMock.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub for window.api
	(globalThis as any).window.api = {
		onRunEvent: vi.fn((_runId: string, cb: (e: RunEvent) => void) => {
			emit = cb;
			return () => {};
		}),
		cancelRun: vi.fn().mockResolvedValue(undefined),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup test stub
	Reflect.deleteProperty((globalThis as any).window, "api");
});

function renderAt(state?: unknown) {
	const entry =
		state !== undefined ? { pathname: "/run/run-1", state } : "/run/run-1";
	return render(
		<MemoryRouter initialEntries={[entry]}>
			<Routes>
				<Route path="/run/:runId" element={<LiveRun />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("LiveRun", () => {
	it("affiche les étapes au fil des événements", async () => {
		renderAt();
		emit({ type: "run-started", runId: "run-1" });
		emit({ type: "step-started", index: 0, title: "Ouvrir la page" });
		emit({ type: "step-passed", index: 0, durationMs: 1200 });
		expect(await screen.findByText("Ouvrir la page")).toBeInTheDocument();
	});
	it("navigue vers le rapport à la fin", async () => {
		renderAt();
		emit({ type: "run-started", runId: "run-1" });
		emit({ type: "run-finished", status: "passed", durationMs: 5000 });
		await waitFor(() =>
			expect(navigateMock).toHaveBeenCalledWith("/report/run-1"),
		);
	});

	it("affiche le badge AUTO et le bandeau en mode auto", () => {
		renderAt({ auto: true });
		expect(screen.getByText("AUTO")).toBeInTheDocument();
		expect(
			screen.getByText(/Première exécution — validation automatique/i),
		).toBeInTheDocument();
	});

	it("n'affiche pas le mode AUTO sans state.auto", () => {
		renderAt(undefined);
		expect(screen.queryByText("AUTO")).not.toBeInTheDocument();
	});

	it("rend les durées en secondes mono, l'étape en cours et la barre Étape X sur Y", async () => {
		renderAt({ auto: true });
		emit({ type: "run-started", runId: "run-1" });
		emit({ type: "step-started", index: 0, title: "Ouvrir la page" });
		emit({ type: "step-passed", index: 0, durationMs: 2100 });
		emit({ type: "step-started", index: 1, title: "Saisir l'identifiant" });
		emit({ type: "step-passed", index: 1, durationMs: 800 });
		emit({ type: "step-started", index: 2, title: "Cliquer sur Valider" });

		// passed step shows mono seconds with 1 decimal (NOT "2100ms")
		expect(await screen.findByText("2.1s")).toBeInTheDocument();
		expect(screen.queryByText("2100ms")).not.toBeInTheDocument();
		expect(screen.getByText("0.8s")).toBeInTheDocument();

		// running step renders "en cours…"
		expect(screen.getByText(/en cours…/i)).toBeInTheDocument();

		// progress line "Étape X sur Y" — 3 started, 3 total
		const progress = screen.getByText(
			(_content, el) =>
				el?.textContent === "Étape 3 sur 3 · Cliquer sur Valider",
		);
		expect(progress).toBeInTheDocument();
	});

	it("affiche tout le parcours dès le run-started (plan complet, non atteint)", async () => {
		renderAt({ auto: true });
		emit({
			type: "run-started",
			runId: "run-1",
			steps: ["Étape A", "Étape B", "Étape C"],
		});

		// All three rows render immediately
		expect(await screen.findByText("Étape A")).toBeInTheDocument();
		expect(screen.getByText("Étape B")).toBeInTheDocument();
		expect(screen.getByText("Étape C")).toBeInTheDocument();

		// All "non atteint" at start
		expect(screen.getAllByText("non atteint")).toHaveLength(3);

		// Progress: 0 started, 3 total
		expect(
			screen.getByText((_content, el) => el?.textContent === "Étape 0 sur 3"),
		).toBeInTheDocument();
	});

	it("met à jour le plan complet au fil des étapes en direct", async () => {
		renderAt({ auto: true });
		emit({
			type: "run-started",
			runId: "run-1",
			steps: ["Étape A", "Étape B", "Étape C"],
		});

		// Start step 0 → "en cours…", progress Étape 1 sur 3
		emit({ type: "step-started", index: 0, title: "Étape A" });
		expect(await screen.findByText(/en cours…/i)).toBeInTheDocument();
		expect(
			screen.getByText(
				(_content, el) => el?.textContent === "Étape 1 sur 3 · Étape A",
			),
		).toBeInTheDocument();

		// Pass step 0 → shows 2.1s, others still non atteint
		emit({ type: "step-passed", index: 0, durationMs: 2100 });
		expect(await screen.findByText("2.1s")).toBeInTheDocument();
		expect(screen.getAllByText("non atteint")).toHaveLength(2);
	});

	it("le bouton est libellé Arrêter et appelle cancelRun", async () => {
		const { default: userEvent } = await import("@testing-library/user-event");
		const user = userEvent.setup();
		renderAt({ auto: true });
		emit({ type: "run-started", runId: "run-1" });
		const stop = screen.getByRole("button", { name: /Arrêter/ });
		await user.click(stop);
		expect(window.api.cancelRun).toHaveBeenCalledWith("run-1");
	});
});
