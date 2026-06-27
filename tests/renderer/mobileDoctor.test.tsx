import { act, render, screen, waitFor } from "@testing-library/react";
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

	// #15: onboarding tip
	it("affiche un conseil d'onboarding vers Environnements", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: true,
			java: ok("Java 17+"),
			maestro: ok("Maestro CLI"),
			adb: ok("adb"),
			device: ok("Appareil joignable"),
		});
		renderDoctor();
		await screen.findByText("Java 17+");
		expect(screen.getByText(/configure.*app id/i)).toBeInTheDocument();
	});

	// #34: LINKS branch test (java absent → openExternal)
	it("java absent → « Ouvrir la page » appelle openExternal avec l'URL Java", async () => {
		mobileDoctor.mockResolvedValue({
			allOk: false,
			java: bad("Java 17+", "Installe Java 17"),
			maestro: ok("Maestro CLI"),
			adb: ok("adb"),
			device: ok("Appareil joignable"),
		});
		renderDoctor();
		await screen.findByText("Java 17+");
		await userEvent.click(
			screen.getByRole("button", { name: /ouvrir la page/i }),
		);
		expect(openExternal).toHaveBeenCalledWith(
			"https://adoptium.net/temurin/releases/?version=17",
		);
	});

	// #41: progress bar during preparation
	it("préparation en cours → affiche le pourcentage de progression", async () => {
		let progressCallback:
			| ((p: { received: number; total: number }) => void)
			| undefined;
		onMaestroProgress.mockImplementation(
			(cb: (p: { received: number; total: number }) => void) => {
				progressCallback = cb;
				return () => {};
			},
		);

		let resolvePrepare!: (v: { ok: boolean }) => void;
		prepareMaestro.mockReturnValue(
			new Promise<{ ok: boolean }>((resolve) => {
				resolvePrepare = resolve;
			}),
		);

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

		// Click Préparer — prepare is pending
		await userEvent.click(screen.getByRole("button", { name: /Préparer/i }));

		// Ensure the progress callback is wired
		await waitFor(() => expect(progressCallback).toBeDefined());

		// Fire progress callback with 50%
		act(() => {
			progressCallback?.({ received: 50, total: 100 });
		});

		// Button should show 50%
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /50%/i })).toBeInTheDocument(),
		);

		// Resolve prepare
		act(() => {
			resolvePrepare({ ok: true });
		});

		// Progress should clear after completion
		await waitFor(() =>
			expect(
				screen.queryByRole("button", { name: /50%/i }),
			).not.toBeInTheDocument(),
		);
	});
});
