import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("enregistrement → auto-run → Rapport Réussi", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-rec-"));
	const app = await electron.launch({
		args: [join(REPO, "out/main/index.js")],
		env: {
			...process.env,
			OTL_WORKSPACE: workspace,
			OTL_FIXTURES: join(REPO, "fixtures"),
			OTL_RUNNER_CONFIG: join(REPO, "playwright.runner.config.ts"),
			OTL_CODEGEN: "node",
			OTL_CODEGEN_ARGS: join(REPO, "tests/fixtures/fake-codegen.mjs"),
		},
	});
	try {
		const win = await app.firstWindow();
		await win.waitForLoadState("domcontentloaded");
		// App now opens on /projects — navigate to the scenarios Hub first
		await win.getByRole("button", { name: "Scénarios" }).click();
		await win.getByRole("button", { name: /nouveau scénario/i }).click();
		await win.getByPlaceholder("Nom du scénario").fill("Mon parcours");
		await win
			.getByRole("button", { name: /démarrer l'enregistrement/i })
			.click();
		await win.getByRole("button", { name: /arrêter/i }).click();
		// Auto-run kicks in: Live Run opens in AUTO mode
		await expect(
			win.locator(".live-run__auto-badge", { hasText: "AUTO" }),
		).toBeVisible({ timeout: 15000 });
		await expect(
			win.getByText(/Première exécution — validation automatique/i),
		).toBeVisible({ timeout: 15000 });
		// The auto run completes and lands on the Report
		await expect(win.getByText("Réussi", { exact: true })).toBeVisible({
			timeout: 120000,
		});
	} finally {
		await app.close();
		rmSync(workspace, { recursive: true, force: true });
	}
});
