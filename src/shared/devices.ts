import type { Platform } from "./types";

// Playwright device used for "responsive" scenarios: recorded and replayed in a
// mobile (iPhone) viewport. We emulate it on Chromium (viewport only) rather than
// switching to the device's default WebKit, so runs work headless and in CI where
// only Chromium is installed.
//
// IMPORTANT: this module must NOT import "@playwright/test" — it is bundled into
// the Electron main process, and pulling in playwright-core there crashes startup
// (it require()s chromium-bidi). We hardcode the viewport instead; the value
// matches devices["iPhone 13"].viewport.
export const RESPONSIVE_DEVICE = "iPhone 13";

interface Viewport {
	width: number;
	height: number;
}

const DEVICE_VIEWPORTS: Record<string, Viewport> = {
	"iPhone 13": { width: 390, height: 664 },
};

export function viewportForDevice(
	deviceName: string | undefined,
): Viewport | null {
	if (!deviceName) return null;
	return DEVICE_VIEWPORTS[deviceName] ?? null;
}

// Env injected into a run/recording so the Playwright config emulates the right
// viewport. Only "responsive" gets a device today — desktop ("web") needs no
// emulation, and "mobile" is Maestro (not Playwright).
export function deviceEnvFor(platform: Platform): Record<string, string> {
	return platform === "responsive" ? { OTL_DEVICE: RESPONSIVE_DEVICE } : {};
}
