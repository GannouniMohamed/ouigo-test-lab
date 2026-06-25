import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const REPO = resolve(__dirname, "../..");

test("groupe: créer / filtrer / éditer / supprimer", async () => {
	const workspace = mkdtempSync(join(tmpdir(), "otl-e2e-grp-"));
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

		// 1. App opens on /projects — seed project visible
		await expect(win.getByText("Projet par défaut")).toBeVisible({
			timeout: 15000,
		});

		// 2. Navigate to the Hub via the sidebar "Scénarios" button
		await win.getByRole("button", { name: "Scénarios" }).click();
		await expect(win.getByRole("heading", { name: "Scénarios" })).toBeVisible({
			timeout: 15000,
		});

		// 3. Click the "+" (Nouveau groupe) tab → /scenarios/groups/new
		await win.getByRole("button", { name: "Nouveau groupe" }).click();
		await expect(
			win.getByRole("heading", { name: "Nouveau groupe" }),
		).toBeVisible({
			timeout: 15000,
		});

		// 4. Fill in the group name, pick a color, click "Créer le groupe"
		await win.getByPlaceholder("Nom du groupe").fill("Réservation");
		// Pick the third color swatch
		await win
			.getByRole("button", { name: /Couleur/ })
			.nth(2)
			.click();
		await win.getByRole("button", { name: "Créer le groupe" }).click();

		// 5. Back on the Hub: the new group tab "Réservation · 0" is visible
		await expect(
			win.getByRole("button", { name: /Réservation\s*·\s*0/ }),
		).toBeVisible({ timeout: 15000 });

		// 6. Click the "Réservation" group tab → filter is active, group section renders
		//    (even though empty) with the "Éditer" button visible.
		await win.getByRole("button", { name: /Réservation\s*·\s*0/ }).click();

		// The group section header should now be rendered with the "Éditer" button.
		// Scope to the Réservation section to avoid ambiguity with other groups.
		const reservationSection = win.locator("section.otl-tunnel-group", {
			has: win.locator("h2", { hasText: "Réservation" }),
		});
		const editerBtn = reservationSection.getByRole("button", {
			name: "Éditer",
		});
		await expect(editerBtn).toBeVisible({ timeout: 15000 });

		// Also verify the empty hint is shown inside the section
		await expect(
			reservationSection.getByText("Aucun scénario dans ce groupe."),
		).toBeVisible({ timeout: 15000 });

		// 7. Click "Éditer" to open the edit screen
		await editerBtn.click();

		await expect(
			win.getByRole("heading", { name: "Modifier le groupe" }),
		).toBeVisible({
			timeout: 15000,
		});

		// Change the description and save
		await win.getByPlaceholder("Description").fill("Tunnel de vente principal");
		await win
			.getByRole("button", { name: "Enregistrer les modifications" })
			.click();

		// Back on the Hub after saving
		await expect(win.getByRole("heading", { name: "Scénarios" })).toBeVisible({
			timeout: 15000,
		});

		// 8. Click the Réservation tab again and use the "Éditer" button to re-open
		await win.getByRole("button", { name: /Réservation\s*·\s*0/ }).click();
		const reservationSection2 = win.locator("section.otl-tunnel-group", {
			has: win.locator("h2", { hasText: "Réservation" }),
		});
		await reservationSection2.getByRole("button", { name: "Éditer" }).click();

		await expect(
			win.getByRole("heading", { name: "Modifier le groupe" }),
		).toBeVisible({
			timeout: 15000,
		});

		const deleteBtn = win.getByRole("button", { name: "Supprimer" });
		await expect(deleteBtn).toBeVisible({ timeout: 15000 });
		await expect(deleteBtn).toBeEnabled();

		// Click "Supprimer" — navigates back to Hub
		await deleteBtn.click();

		// Back on Hub: the "Réservation · 0" tab is gone
		await expect(win.getByRole("heading", { name: "Scénarios" })).toBeVisible({
			timeout: 15000,
		});
		await expect(
			win.getByRole("button", { name: /Réservation/ }),
		).not.toBeVisible({ timeout: 15000 });
	} finally {
		await app.close();
		rmSync(workspace, { recursive: true, force: true });
	}
});
