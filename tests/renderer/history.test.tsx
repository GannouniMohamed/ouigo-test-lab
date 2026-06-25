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
	useAppStore.setState({ activeProjectId: "default" });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listReports: vi.fn().mockResolvedValue([
			{
				runId: "r2",
				scenarioId: "login",
				status: "failed",
				startedAt: "2026-06-23T12:00:00Z",
				durationMs: 3000,
			},
			{
				runId: "r1",
				scenarioId: "login",
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
});
