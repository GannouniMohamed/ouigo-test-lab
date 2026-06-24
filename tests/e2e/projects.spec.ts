import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("création d'un projet avec environnements puis retour à la liste", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-proj-"));
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

		// App opens on the projects list (seed creates "Projet par défaut")
		await expect(win.getByText("Projet par défaut")).toBeVisible({
			timeout: 15000,
		});

		// Open the new-project form
		await win.getByRole("button", { name: /nouveau projet/i }).click();

		// Fill in project name
		await win.getByPlaceholder("Nom du projet").fill("Démo E2E");

		// Fill in the two URL inputs (default rows are Préprod and Recette)
		const urls = win.getByPlaceholder("https://…");
		await urls.nth(0).fill("https://preprod.demo");
		await urls.nth(1).fill("https://recette.demo");

		// Submit — after creation the app navigates to the new project's Hub (/scenarios)
		await win.getByRole("button", { name: /créer le projet/i }).click();

		// Return to the projects list via the context-bar breadcrumb
		await expect(win.locator(".otl-ctxbar").getByRole("button", { name: "Projets" })).toBeVisible({
			timeout: 15000,
		});
		await win.locator(".otl-ctxbar").getByRole("button", { name: "Projets" }).click();

		// The new project should appear with its environment count
		await expect(win.getByText("Démo E2E")).toBeVisible({ timeout: 15000 });
		await expect(win.getByText(/2 environnements/i)).toBeVisible({
			timeout: 15000,
		});
	} finally {
		await app.close();
		rmSync(workspace, { recursive: true, force: true });
	}
});
