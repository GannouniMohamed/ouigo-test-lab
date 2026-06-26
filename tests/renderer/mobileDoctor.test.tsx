import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileDoctor from "../../src/renderer/screens/MobileDoctor";

const ok = (label: string) => ({ ok: true, label, version: "x" });
const bad = (label: string, hint: string) => ({ ok: false, label, hint });

const mobileDoctor = vi.fn();
const startDevice = vi.fn();

beforeEach(() => {
	mobileDoctor.mockReset();
	startDevice.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = { mobileDoctor, startDevice };
});
afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

function renderDoctor() {
	render(
		<MemoryRouter>
			<MobileDoctor />
		</MemoryRouter>,
	);
}

describe("MobileDoctor", () => {
	it("affiche les 5 contrôles et leurs conseils", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: false,
			java: ok("Java 17+"),
			maestro: bad("Maestro CLI", "Installe Maestro : curl -Ls …"),
			adb: ok("adb"),
			studio: ok("Maestro Studio"),
			device: bad(
				"Appareil joignable",
				"Branche un téléphone ou démarre un émulateur.",
			),
		});
		renderDoctor();
		expect(await screen.findByText("Java 17+")).toBeInTheDocument();
		expect(screen.getByText("Maestro CLI")).toBeInTheDocument();
		expect(screen.getByText("adb")).toBeInTheDocument();
		expect(screen.getByText("Maestro Studio")).toBeInTheDocument();
		expect(screen.getByText("Appareil joignable")).toBeInTheDocument();
		expect(screen.getByText(/Installe Maestro/)).toBeInTheDocument();
		expect(screen.getByText(/Branche un téléphone/)).toBeInTheDocument();
	});

	it("« Démarrer un émulateur » lance startDevice puis revérifie", async () => {
		mobileDoctor
			.mockResolvedValueOnce({
				allOk: false,
				java: ok("Java 17+"),
				maestro: ok("Maestro CLI"),
				adb: ok("adb"),
				studio: ok("Maestro Studio"),
				device: bad("Appareil joignable", "…"),
			})
			.mockResolvedValueOnce({
				allOk: true,
				java: ok("Java 17+"),
				maestro: ok("Maestro CLI"),
				adb: ok("adb"),
				studio: ok("Maestro Studio"),
				device: ok("Appareil joignable"),
			});
		startDevice.mockResolvedValue({ ok: true });
		renderDoctor();
		await screen.findByText("Java 17+");
		await userEvent.click(
			screen.getByRole("button", { name: /démarrer un émulateur/i }),
		);
		await waitFor(() => expect(startDevice).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
	});

	it("« Revérifier » relance le diagnostic", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: true,
			java: ok("Java 17+"),
			maestro: ok("Maestro CLI"),
			adb: ok("adb"),
			studio: ok("Maestro Studio"),
			device: ok("Appareil joignable"),
		});
		renderDoctor();
		await screen.findByText("Java 17+");
		await userEvent.click(screen.getByRole("button", { name: /revérifier/i }));
		await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
	});
});
