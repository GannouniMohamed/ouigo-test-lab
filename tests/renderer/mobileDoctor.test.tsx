import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileDoctor from "../../src/renderer/screens/MobileDoctor";

const ok = (label: string) => ({ ok: true, label, version: "x" });
const bad = (label: string, hint: string) => ({ ok: false, label, hint });

const mobileDoctor = vi.fn();
const startDevice = vi.fn();
const prepareMaestro = vi.fn();
const onMaestroProgress = vi.fn(() => () => {});
const openExternal = vi.fn();

beforeEach(() => {
	mobileDoctor.mockReset();
	startDevice.mockReset();
	prepareMaestro.mockReset();
	prepareMaestro.mockResolvedValue({ ok: true });
	onMaestroProgress.mockReset();
	onMaestroProgress.mockImplementation(() => () => {});
	openExternal.mockReset();
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		platform: "darwin",
		mobileDoctor,
		startDevice,
		prepareMaestro,
		onMaestroProgress,
		openExternal,
	};
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
	it("affiche les 4 contrôles et leurs conseils", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: false,
			java: ok("Java 17+"),
			maestro: bad("Maestro CLI", "Installe Maestro : curl -Ls …"),
			adb: ok("adb"),
			device: bad(
				"Appareil joignable",
				"Branche un téléphone ou démarre un émulateur.",
			),
		});
		renderDoctor();
		expect(await screen.findByText("Java 17+")).toBeInTheDocument();
		expect(screen.getByText("Maestro CLI")).toBeInTheDocument();
		expect(screen.getByText("adb")).toBeInTheDocument();
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
				device: bad("Appareil joignable", "…"),
			})
			.mockResolvedValueOnce({
				allOk: true,
				java: ok("Java 17+"),
				maestro: ok("Maestro CLI"),
				adb: ok("adb"),
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
			device: ok("Appareil joignable"),
		});
		renderDoctor();
		await screen.findByText("Java 17+");
		await userEvent.click(screen.getByRole("button", { name: /revérifier/i }));
		await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
	});

	it("Maestro absent → bouton « Préparer » lance prepareMaestro puis revérifie", async () => {
		mobileDoctor
			.mockResolvedValueOnce({
				allOk: false,
				java: ok("Java 17+"),
				maestro: bad("Maestro CLI", "Installe…"),
				adb: ok("adb"),
				device: ok("Appareil joignable"),
			})
			.mockResolvedValueOnce({
				allOk: true,
				java: ok("Java 17+"),
				maestro: ok("Maestro CLI"),
				adb: ok("adb"),
				device: ok("Appareil joignable"),
			});
		renderDoctor();
		await screen.findByText("Maestro CLI");
		await userEvent.click(
			await screen.findByRole("button", { name: /Préparer/i }),
		);
		await waitFor(() => expect(prepareMaestro).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(mobileDoctor).toHaveBeenCalledTimes(2));
	});

	it("préparation échoue → message d'erreur affiché", async () => {
		prepareMaestro.mockResolvedValue({
			ok: false,
			error: "réseau indisponible",
		});
		mobileDoctor.mockResolvedValue({
			allOk: false,
			java: ok("Java 17+"),
			maestro: bad("Maestro CLI", "Installe…"),
			adb: ok("adb"),
			device: ok("Appareil joignable"),
		});
		renderDoctor();
		await screen.findByText("Maestro CLI");
		await userEvent.click(
			await screen.findByRole("button", { name: /Préparer/i }),
		);
		await waitFor(() =>
			expect(screen.getByText(/réseau indisponible/i)).toBeInTheDocument(),
		);
	});
});
