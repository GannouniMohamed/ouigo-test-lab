import { describe, expect, it } from "vitest";
import {
	RESPONSIVE_DEVICE,
	deviceEnvFor,
	viewportForDevice,
} from "../../src/shared/devices";

describe("deviceEnvFor", () => {
	it("injecte OTL_DEVICE pour une plateforme responsive", () => {
		expect(deviceEnvFor("responsive")).toEqual({
			OTL_DEVICE: RESPONSIVE_DEVICE,
		});
	});

	it("n'injecte rien pour le web desktop", () => {
		expect(deviceEnvFor("web")).toEqual({});
	});

	it("n'injecte rien pour mobile (Maestro, pas Playwright)", () => {
		expect(deviceEnvFor("mobile")).toEqual({});
	});

	it("expose un viewport mobile pour le device responsive", () => {
		const vp = viewportForDevice(RESPONSIVE_DEVICE);
		expect(vp).not.toBeNull();
		expect(vp?.width).toBeLessThan(500);
	});

	it("le viewport correspond au descripteur Playwright iPhone 13", async () => {
		// Garde-fou: notre valeur codée en dur ne doit pas diverger de Playwright.
		const { devices } = await import("@playwright/test");
		expect(viewportForDevice(RESPONSIVE_DEVICE)).toEqual(
			devices[RESPONSIVE_DEVICE].viewport,
		);
	});

	it("renvoie null pour un device inconnu", () => {
		expect(viewportForDevice("Pixel 9000")).toBeNull();
		expect(viewportForDevice(undefined)).toBeNull();
	});
});
