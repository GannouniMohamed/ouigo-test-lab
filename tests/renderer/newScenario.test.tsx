import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewScenario from "../../src/renderer/screens/NewScenario";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	navigateMock.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		listEnvironments: vi
			.fn()
			.mockResolvedValue([
				{ id: "local", label: "Local", baseURL: "https://x", variables: {} },
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
	};
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
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
				expect.objectContaining({ name: "Parcours", environmentId: "local" }),
			),
		);
		await userEvent.click(screen.getByRole("button", { name: /arrêter/i }));
		await waitFor(() => {
			expect(window.api.stopRecording).toHaveBeenCalledWith("rec-1");
			expect(navigateMock).toHaveBeenCalledWith("/scenarios");
		});
	});
});
