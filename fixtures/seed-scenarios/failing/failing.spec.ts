import { expect, test } from "@playwright/test";

test("parcours en échec", async ({ page }) => {
	await test.step("Ouvrir la page d'accueil", async () => {
		await page.goto(process.env.PLAYWRIGHT_BASE_URL as string);
	});
	await test.step("Cliquer sur un bouton inexistant", async () => {
		// Ce bouton n'existe pas → échec + capture automatique
		await page
			.getByRole("button", { name: "Connexion" })
			.click({ timeout: 3000 });
	});
});
