import { describe, expect, it } from "vitest";
import { rebaseSpecUrls } from "../../src/shared/spec";

const SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://ouigo-fr-acca.idtgv.com/fr-FR');
  await page.getByLabel('Accepter').click();
});
`;

describe("rebaseSpecUrls", () => {
	it("rebase l'URL absolue enregistrée vers l'env actif", () => {
		const out = rebaseSpecUrls(
			SPEC,
			"https://ouigo-fr-acca.idtgv.com",
			"https://ventes.ouigo.com/",
		);
		expect(out).toContain("page.goto('https://ventes.ouigo.com/fr-FR')");
		expect(out).not.toContain("idtgv.com");
	});

	it("normalise les slashs de fin (from et to)", () => {
		const out = rebaseSpecUrls(
			"await page.goto('https://acc-a.example/');",
			"https://acc-a.example/",
			"https://prod.example",
		);
		expect(out).toBe("await page.goto('https://prod.example/');");
	});

	it("no-op quand from === to (slash près)", () => {
		const out = rebaseSpecUrls(
			SPEC,
			"https://ouigo-fr-acca.idtgv.com/",
			"https://ouigo-fr-acca.idtgv.com",
		);
		expect(out).toBe(SPEC);
	});

	it("no-op quand from est vide (env enregistré introuvable)", () => {
		expect(rebaseSpecUrls(SPEC, "", "https://prod.example")).toBe(SPEC);
	});

	it("remplace toutes les occurrences", () => {
		const spec =
			"goto('https://acc-a.example/a'); goto('https://acc-a.example/b');";
		const out = rebaseSpecUrls(
			spec,
			"https://acc-a.example",
			"https://p.example",
		);
		expect(out).toBe(
			"goto('https://p.example/a'); goto('https://p.example/b');",
		);
	});
});
