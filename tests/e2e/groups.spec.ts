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

		// 6. Click the "Réservation" group tab → filter is active, group is empty
		//    so "Aucun scénario" placeholder is visible
		await win.getByRole("button", { name: /Réservation\s*·\s*0/ }).click();
		await expect(win.getByText("Aucun scénario")).toBeVisible({
			timeout: 15000,
		});

		// 7. Open the edit screen: navigate directly since the edit button is in the
		//    group header which only renders when the group has scenarios.
		//    We click the "Tous" tab first so we can see the default group's edit button,
		//    but for "Réservation" we navigate via the URL pattern.
		//    Strategy: click "Tous" to show all groups, then click "Éditer" scoped
		//    to the Réservation group header.
		//    Because Réservation has 0 scenarios, its section header is hidden when
		//    "Tous" is active (filter hides empty groups). Navigate directly instead.
		await win.getByRole("button", { name: /Tous\s*·/ }).click();
		// The "Réservation" group section header only appears if it has items.
		// Since it's empty, we navigate programmatically to the edit screen.
		// Use the breadcrumb nav in NewGroupe/EditGroupe which accepts navigation.
		// We'll find the tunnelId from the tab button's click handler by navigating
		// to /scenarios and then triggering edit via URL.
		// Best approach: use Electron's evaluate to get the current hash and tunnelId.
		// Alternatively: click "Réservation · 0" tab to set the filter, then navigate
		// using the app's evaluate.
		await win.getByRole("button", { name: /Réservation\s*·\s*0/ }).click();

		// Evaluate to get the tunnel id from the IPC
		const tunnelId = await win.evaluate(async () => {
			const projects = await window.api.listProjects();
			const project = projects[0];
			const tunnels = await window.api.listTunnels(project.id);
			const t = tunnels.find((x: { name: string }) => x.name === "Réservation");
			return t?.id ?? null;
		});
		expect(tunnelId).not.toBeNull();

		// Navigate to the edit screen
		await win.evaluate((id: string) => {
			window.location.hash = `/scenarios/groups/${id}/edit`;
		}, tunnelId as string);

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

		// 8. Re-open edit screen and assert "Supprimer" is enabled (empty group, not last)
		await win.evaluate((id: string) => {
			window.location.hash = `/scenarios/groups/${id}/edit`;
		}, tunnelId as string);

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
