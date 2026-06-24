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
	it("liste les exécutions avec le nom du scénario", async () => {
		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);
		expect(await screen.findAllByText("Parcours de connexion")).toHaveLength(2);
	});
	it("clic sur une ligne ouvre le rapport", async () => {
		render(
			<MemoryRouter>
				<History />
			</MemoryRouter>,
		);
		const rows = await screen.findAllByText("Parcours de connexion");
		await userEvent.click(rows[0]);
		expect(navigateMock).toHaveBeenCalledWith("/report/r2");
	});
});
