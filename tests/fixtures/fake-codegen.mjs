#!/usr/bin/env node
// Fake `playwright codegen`: writes a spec to the -o path, then waits.
const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const out = oi >= 0 ? args[oi + 1] : null;
import("node:fs").then(({ writeFileSync }) => {
	if (out) {
		writeFileSync(
			out,
			'import { expect, test } from "@playwright/test";\n' +
				'test("parcours enregistré", async ({ page }) => {\n' +
				"  await page.goto(process.env.PLAYWRIGHT_BASE_URL);\n" +
				'  await expect(page.locator("h1")).toHaveText("Accueil");\n' +
				"});\n",
		);
	}
	setInterval(() => {}, 1000); // stay alive until killed by stopRecording
});
