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

function renderAt() {
	return render(
		<MemoryRouter initialEntries={["/run/run-1"]}>
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
});
