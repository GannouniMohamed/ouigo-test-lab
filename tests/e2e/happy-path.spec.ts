import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("happy path: lancer le scénario seed et voir Réussi", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-"));
	const app = await electron.launch({
		args: [join(REPO, "out/main/index.js")],
		env: {
			...process.env,
			OTL_WORKSPACE: workspace,
			OTL_FIXTURES: join(REPO, "fixtures"),
			OTL_RUNNER_CONFIG: join(REPO, "playwright.runner.config.ts"),
		},
	});
	try {
		const win = await app.firstWindow();
		await win.waitForLoadState("domcontentloaded");
		// Library shows the seeded scenario
		await expect(win.getByText("Parcours d'accueil")).toBeVisible({
			timeout: 15000,
		});
		// Launch it
		await win
			.getByRole("button", { name: /lancer/i })
			.first()
			.click();
		// The run executes Playwright headless against the file:// site, then routes to the report
		await expect(win.getByText("Réussi")).toBeVisible({ timeout: 120000 });
	} finally {
		await app.close();
		rmSync(workspace, { recursive: true, force: true });
	}
});
