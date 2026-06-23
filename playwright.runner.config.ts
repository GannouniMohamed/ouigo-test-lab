import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: process.env.OTL_TEST_DIR || ".",
	reporter: [
		["list"],
		["json", { outputFile: process.env.OTL_JSON_OUT || "pw.json" }],
	],
	outputDir: process.env.OTL_ARTIFACTS || "pw-artifacts",
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL,
		screenshot: "only-on-failure",
		headless: true,
	},
});
