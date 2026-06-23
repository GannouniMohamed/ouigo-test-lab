import { expect, test } from "@playwright/test";

test("parcours d'accueil", async ({ page }) => {
	await test.step("Ouvrir la page d'accueil", async () => {
		await page.goto(process.env.PLAYWRIGHT_BASE_URL as string);
	});
	await test.step("Vérifier le titre", async () => {
		await expect(page.locator("h1")).toHaveText("Accueil");
	});
});
