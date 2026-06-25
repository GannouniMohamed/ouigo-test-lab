import { describe, expect, it } from "vitest";
import { humanizeStep } from "../../src/renderer/lib/humanizeStep";

describe("humanizeStep", () => {
	it("maps page.goto to Ouvrir la page", () => {
		expect(
			humanizeStep("page.goto(process.env.PLAYWRIGHT_BASE_URL as string)"),
		).toBe("Ouvrir la page");
		expect(humanizeStep("page.goto('https://x')")).toBe("Ouvrir la page");
	});

	it("maps getByRole button click to Cliquer sur le bouton", () => {
		expect(
			humanizeStep("page.getByRole('button', { name: 'Connexion' }).click()"),
		).toBe("Cliquer sur le bouton « Connexion »");
	});

	it("maps a bare click to Cliquer", () => {
		expect(humanizeStep("page.click()")).toBe("Cliquer");
	});

	it("maps toHaveText to Vérifier le texte", () => {
		expect(
			humanizeStep('expect(page.locator("h1")).toHaveText("Accueil")'),
		).toBe("Vérifier le texte « Accueil »");
		expect(
			humanizeStep("expect(page.locator('h1')).toContainText('Bonjour')"),
		).toBe("Vérifier le texte « Bonjour »");
	});

	it("maps fill to Saisir", () => {
		expect(humanizeStep("getByLabel('Mot de passe').fill('secret')")).toBe(
			"Saisir « secret »",
		);
		expect(humanizeStep("page.getByLabel('Email').type('a@b.c')")).toBe(
			"Saisir « a@b.c »",
		);
	});

	it("maps press to Appuyer sur", () => {
		expect(humanizeStep("page.getByLabel('q').press('Enter')")).toBe(
			"Appuyer sur « Enter »",
		);
	});

	it("maps check and selectOption", () => {
		expect(
			humanizeStep("page.getByRole('checkbox', { name: 'CGU' }).check()"),
		).toBe("Cocher la case « CGU »");
		expect(humanizeStep("page.getByLabel('Pays').selectOption('FR')")).toBe(
			"Sélectionner le champ « Pays »",
		);
	});

	it("maps toBeVisible", () => {
		expect(
			humanizeStep("expect(page.getByText('Bienvenue')).toBeVisible()"),
		).toBe("Vérifier que « Bienvenue » est visible");
	});

	it("maps toHaveURL", () => {
		expect(humanizeStep("expect(page).toHaveURL('https://x/home')")).toBe(
			"Vérifier l'URL « https://x/home »",
		);
	});

	it("maps toBeChecked", () => {
		expect(
			humanizeStep(
				"expect(page.getByRole('checkbox', { name: 'CGU' })).toBeChecked()",
			),
		).toBe("Vérifier que la case « CGU » est coché");
	});

	it("maps generic expect", () => {
		expect(humanizeStep("expect(page.locator('.foo')).toHaveCount(3)")).toBe(
			"Vérifier « .foo »",
		);
	});

	it("derives locators from getByLabel/Placeholder/Text/TestId/locator", () => {
		expect(humanizeStep("getByLabel('Nom').click()")).toBe(
			"Cliquer sur le champ « Nom »",
		);
		expect(humanizeStep("getByPlaceholder('Rechercher').click()")).toBe(
			"Cliquer sur le champ « Rechercher »",
		);
		expect(humanizeStep("getByText('Suivant').click()")).toBe(
			"Cliquer sur « Suivant »",
		);
		expect(humanizeStep("getByTestId('submit').click()")).toBe(
			"Cliquer sur « submit »",
		);
		expect(humanizeStep("page.locator('.btn').click()")).toBe(
			"Cliquer sur « .btn »",
		);
		expect(humanizeStep("getByRole('link', { name: 'Aide' }).click()")).toBe(
			"Cliquer sur le lien « Aide »",
		);
	});

	it("passes already-human text through unchanged", () => {
		expect(humanizeStep("Ouvrir la page")).toBe("Ouvrir la page");
		expect(humanizeStep("Cliquer sur le bouton « Connexion »")).toBe(
			"Cliquer sur le bouton « Connexion »",
		);
	});

	it("falls back to the raw string for unmatched/garbage input", () => {
		expect(humanizeStep("foo.bar.baz(123)")).toBe("foo.bar.baz(123)");
		expect(humanizeStep("")).toBe("");
		expect(humanizeStep("   ")).toBe("");
	});
});
