#!/usr/bin/env node
// Fake `playwright codegen`: writes a spec to the -o path SYNCHRONOUSLY at
// startup (mimics codegen's live-updated output file), then stays alive until
// killed by stopRecording. A synchronous static import + immediate write avoids
// a race where the process was killed before an async write completed — that
// race made the recording E2E flaky.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const out = oi >= 0 ? args[oi + 1] : null;

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
