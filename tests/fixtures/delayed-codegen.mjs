#!/usr/bin/env node
// Fake `playwright codegen` that writes the spec AFTER a short delay (300ms),
// simulating codegen's throttled final write that lands just before exit.
// Used by recorderStop.test.ts to verify the graceful stop waits for the flush.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const out = oi >= 0 ? args[oi + 1] : null;

setTimeout(() => {
	if (out) {
		writeFileSync(
			out,
			'import { expect, test } from "@playwright/test";\n' +
				'test("delayed action", async ({ page }) => {\n' +
				"  await page.goto(process.env.PLAYWRIGHT_BASE_URL);\n" +
				"  await page.getByRole('button').click();\n" +
				"});\n",
		);
	}
}, 300);

setInterval(() => {}, 1000); // stay alive until killed by stopRecording
