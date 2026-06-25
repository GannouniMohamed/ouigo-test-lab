import { defineConfig } from "@playwright/test";
import { viewportForDevice } from "./src/shared/devices";

// "responsive" scenarios set OTL_DEVICE (e.g. "iPhone 13"); replay them in that
// device's viewport on Chromium. We apply only the viewport (not isMobile/UA or
// the device's default WebKit) so the run stays on the same Chromium engine the
// scenario was recorded in — matching layout and keeping CI (Chromium-only) green.
const deviceViewport = viewportForDevice(process.env.OTL_DEVICE) ?? undefined;

// Fail fast: cap how long a single action / navigation may hang. Without these,
// a recorded selector that no longer matches on replay (dynamic dates, prices,
// cookie banners…) blocks until the 30s TEST timeout, which kills the test
// mid-step — so the step reporter never sees it and the report comes back
// empty. With a per-action cap the stuck action throws at its own limit, the
// reporter captures it as a failed step, and the user sees exactly where the
// replay blocked. Overridable via env for slower environments.
const num = (v: string | undefined, fallback: number): number => {
	const n = v ? Number(v) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default defineConfig({
	testDir: process.env.OTL_TEST_DIR || ".",
	reporter: [
		["list"],
		["json", { outputFile: process.env.OTL_JSON_OUT || "pw.json" }],
		["./playwright.step-reporter.cjs"],
	],
	outputDir: process.env.OTL_ARTIFACTS || "pw-artifacts",
	timeout: num(process.env.OTL_TEST_TIMEOUT, 90000),
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL,
		// Mobile viewport for "responsive" runs (undefined → Playwright default).
		...(deviceViewport ? { viewport: deviceViewport } : {}),
		screenshot: "only-on-failure",
		// Match the locale scenarios are recorded in (French) so language-aware
		// UIs — e.g. the Didomi consent banner — render the same text the
		// recorded selectors expect. Default-FR; override via OTL_LOCALE.
		locale: process.env.OTL_LOCALE || "fr-FR",
		// Headless unless the runner explicitly asks for headed (OTL_HEADLESS="0").
		// Default-safe: anything running this config directly (tests, CI) stays
		// headless unless it opts in.
		headless: process.env.OTL_HEADLESS !== "0",
		actionTimeout: num(process.env.OTL_ACTION_TIMEOUT, 15000),
		navigationTimeout: num(process.env.OTL_NAV_TIMEOUT, 30000),
	},
});
