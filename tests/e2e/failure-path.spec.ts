import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("failure path: scénario en échec → Échec + capture", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-fail-"));
	const app = await electron.launch({
		args: [join(REPO, "out/main/index.js")],
		env: {
			...process.env,
			OTL_WORKSPACE: workspace,
			OTL_FIXTURES: join(REPO, "fixtures"),
			OTL_RUNNER_CONFIG: join(REPO, "playwright.runner.config.ts"),
			OTL_FORCE_HEADLESS: "1",
		},
	});
	try {
		const win = await app.firstWindow();
		await win.waitForLoadState("domcontentloaded");
		// App now opens on /projects — navigate to the scenarios Hub first
		await win.getByRole("button", { name: "Scénarios" }).click();
		await expect(win.getByText("Parcours en échec")).toBeVisible({
			timeout: 15000,
		});
		await win
			.getByTestId("scenario-card-failing")
			.getByRole("button", { name: /lancer/i })
			.click();
		await win.getByRole("button", { name: "Démarrer" }).click();
		await expect(win.getByText("Échec", { exact: true })).toBeVisible({
			timeout: 120000,
		});
		await expect(win.getByTestId("failure-screenshot")).toBeVisible({
			timeout: 15000,
		});
	} finally {
		await app.close();
		rmSync(workspace, { recursive: true, force: true });
	}
});
