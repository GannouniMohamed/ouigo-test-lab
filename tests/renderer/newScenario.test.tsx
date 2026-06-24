import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewScenario from "../../src/renderer/screens/NewScenario";
import { useAppStore } from "../../src/renderer/store";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listEnvironments: vi.fn().mockResolvedValue([]),
		listTunnels: vi.fn().mockResolvedValue([
			{
				id: "general",
				projectId: "default",
				name: "Général",
				order: 0,
				createdAt: "2026-06-24T00:00:00Z",
			},
		]),
		startRecording: vi.fn().mockResolvedValue({ recordingId: "rec-1" }),
		stopRecording: vi.fn().mockResolvedValue({
			id: "parcours",
			name: "Parcours",
			platform: "web",
			browser: "chromium",
			defaultEnvironmentId: "local",
			tags: [],
			specFile: "parcours.spec.ts",
			createdAt: "",
			lastRun: { status: "never" },
		}),
	} as unknown as typeof window.api;
	useAppStore.setState({ activeProjectId: "default" });
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
	useAppStore.setState({ activeProjectId: "" });
});

describe("NewScenario", () => {
	it("démarre puis arrête l'enregistrement et revient à la bibliothèque", async () => {
		render(
			<MemoryRouter>
				<NewScenario />
			</MemoryRouter>,
		);
		await userEvent.type(
			screen.getByPlaceholderText("Nom du scénario"),
			"Parcours",
		);
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer l'enregistrement/i }),
		);
		await waitFor(() =>
			expect(window.api.startRecording).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Parcours",
					browser: "chromium",
					projectId: "default",
					tunnelId: "general",
				}),
			),
		);
		await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
		await waitFor(() => {
			expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1");
			expect(navigateMock).toHaveBeenCalledWith("/scenarios");
		});
	});
});
