import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import History from "../../src/renderer/screens/History";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	useAppStore.setState({ activeProjectId: "default", activeEnvByProject: {} });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listReports: vi.fn().mockResolvedValue([
			{
				runId: "r2",
				scenarioId: "login",
				projectId: "default",
				status: "failed",
				startedAt: "2026-06-23T12:00:00Z",
				durationMs: 3000,
			},
			{
				runId: "r1",
				scenarioId: "login",
				projectId: "default",
				status: "passed",
				startedAt: "2026-06-23T10:00:00Z",
				durationMs: 8400,
			},
		]),
		listScenariosByProject: vi.fn().mockResolvedValue([
			{
				id: "login",
				name: "Parcours de connexion",
				projectId: "default",
				tunnelId: "general",
			},
		]),
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

describe("History", () => {
	it("liste les exécutions simples avec le nom du scénario", async () => {
		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);
		expect(await screen.findAllByText("Parcours de connexion")).toHaveLength(2);
	});
	it("clic sur une exécution simple ouvre le rapport", async () => {
		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);
		const rows = await screen.findAllByText("Parcours de connexion");
		await userEvent.click(rows[0]);
		expect(navigateMock).toHaveBeenCalledWith("/report/r2");
	});

	it("regroupe un lot en un bloc repliable expansible vers ses runs", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listReports = vi.fn().mockResolvedValue([
			{
				runId: "b1",
				scenarioId: "login",
				status: "passed",
				startedAt: "2026-06-23T14:00:00Z",
				durationMs: 2000,
				batchId: "lot1",
			},
			{
				runId: "b2",
				scenarioId: "login",
				status: "failed",
				startedAt: "2026-06-23T14:01:00Z",
				durationMs: 4000,
				batchId: "lot1",
			},
			{
				runId: "s1",
				scenarioId: "login",
				status: "passed",
				startedAt: "2026-06-23T10:00:00Z",
				durationMs: 1000,
			},
		]);

		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);

		// One lot header with "LOT · 2 runs"
		expect(await screen.findByText(/LOT · 2 runs/i)).toBeInTheDocument();
		// Collapsed by default: run detail not visible
		expect(screen.queryByText("Run #1")).not.toBeInTheDocument();

		// Expand the lot
		await userEvent.click(screen.getByText(/LOT · 2 runs/i));
		expect(await screen.findByText("Run #1")).toBeInTheDocument();
		expect(screen.getByText("Run #2")).toBeInTheDocument();

		// A simple run still renders inline
		expect(screen.getByText(/Exécution simple/i)).toBeInTheDocument();
	});

	it("clic sur Voir le détail d'un run de lot navigue vers son rapport", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listReports = vi.fn().mockResolvedValue([
			{
				runId: "b1",
				scenarioId: "login",
				status: "passed",
				startedAt: "2026-06-23T14:00:00Z",
				durationMs: 2000,
				batchId: "lot1",
			},
			{
				runId: "b2",
				scenarioId: "login",
				status: "failed",
				startedAt: "2026-06-23T14:01:00Z",
				durationMs: 4000,
				batchId: "lot1",
			},
		]);

		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);

		await userEvent.click(await screen.findByText(/LOT · 2 runs/i));
		const links = await screen.findAllByText(/Voir le détail/i);
		await userEvent.click(links[0]);
		expect(navigateMock).toHaveBeenCalledWith("/report/b1");
	});

	it("n'affiche que les rapports du projet actif (+ héritage par scénario)", async () => {
		useAppStore.setState({ activeProjectId: "p1", activeEnvByProject: {} });
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listReports = vi.fn().mockResolvedValue([
			{
				runId: "p1-direct",
				scenarioId: "login",
				projectId: "p1",
				status: "passed",
				startedAt: "2026-06-23T15:00:00Z",
				durationMs: 1000,
			},
			{
				runId: "p2-direct",
				scenarioId: "checkout",
				projectId: "p2",
				status: "passed",
				startedAt: "2026-06-23T14:00:00Z",
				durationMs: 1000,
			},
			{
				// legacy: no projectId, but scenarioId belongs to p1
				runId: "legacy-p1",
				scenarioId: "login",
				status: "passed",
				startedAt: "2026-06-23T13:00:00Z",
				durationMs: 1000,
			},
			{
				// legacy: no projectId, scenarioId NOT in p1 -> hidden
				runId: "legacy-other",
				scenarioId: "checkout",
				status: "passed",
				startedAt: "2026-06-23T12:00:00Z",
				durationMs: 1000,
			},
		]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listScenariosByProject = vi
			.fn()
			.mockResolvedValue([
				{
					id: "login",
					name: "Parcours de connexion",
					projectId: "p1",
					tunnelId: "general",
				},
			]);

		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);

		// Two p1 reports (direct + legacy-by-scenario) render as single rows
		expect(await screen.findAllByText("Parcours de connexion")).toHaveLength(2);
		// p2 reports + non-matching legacy never render
		expect(screen.queryByText("checkout")).not.toBeInTheDocument();
	});

	it("filtre par environnement actif quand un env est sélectionné", async () => {
		useAppStore.setState({
			activeProjectId: "p1",
			activeEnvByProject: { p1: "env-preprod" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listReports = vi.fn().mockResolvedValue([
			{
				runId: "preprod",
				scenarioId: "login",
				projectId: "p1",
				environmentId: "env-preprod",
				status: "passed",
				startedAt: "2026-06-23T15:00:00Z",
				durationMs: 1000,
			},
			{
				runId: "prod",
				scenarioId: "login",
				projectId: "p1",
				environmentId: "env-prod",
				status: "passed",
				startedAt: "2026-06-23T14:00:00Z",
				durationMs: 1000,
			},
		]);
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(globalThis as any).window.api.listScenariosByProject = vi
			.fn()
			.mockResolvedValue([
				{
					id: "login",
					name: "Parcours de connexion",
					projectId: "p1",
					tunnelId: "general",
				},
			]);

		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);

		// Only the env-preprod report renders
		expect(await screen.findAllByText("Parcours de connexion")).toHaveLength(1);
		const rows = screen.getAllByText("Parcours de connexion");
		await userEvent.click(rows[0]);
		expect(navigateMock).toHaveBeenCalledWith("/report/preprod");
	});
});
