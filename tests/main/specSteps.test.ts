import { describe, expect, it } from "vitest";
import { parseRecordedSteps } from "../../src/shared/spec";

const EMPTY_SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
});
`;

const KEV_SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://ouigo-fr-acca.idtgv.com/fr-FR');
  await page.getByLabel('Accepter & Fermer: Accepter').click();
  await page.getByTestId('e2e_search-engine_origin-station_input-field_input').click();
  await page.getByTestId('e2e_customer-fieldset-firstName_input').fill('med');
  await page.getByLabel('Mot de passe').press('Enter');
  await page.getByTestId('e2e_passengers.adults.0-fieldset-isCustomer_checkbox').check();
  await expect(page.getByTestId('e2e_option-item-pram_input')).toBeVisible();
  await expect(page.locator('form')).toMatchAriaSnapshot(\`
    - img "SNCF Voyageurs"
    - heading "Mon Identifiant SNCF" [level=1]
    \`);
});
`;

describe("parseRecordedSteps", () => {
	it("returns an empty list for a spec with no actions", () => {
		expect(parseRecordedSteps(EMPTY_SPEC)).toEqual([]);
	});

	it("counts every await page.* / expect.* action, including a multiline aria snapshot", () => {
		const steps = parseRecordedSteps(KEV_SPEC);
		// goto, click, click, fill, press, check, expect.toBeVisible, expect.toMatchAriaSnapshot = 8
		expect(steps.length).toBe(8);
		expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it("produces readable titles without the await keyword or trailing semicolon", () => {
		const steps = parseRecordedSteps(KEV_SPEC);
		expect(steps[0].title).toBe(
			"page.goto('https://ouigo-fr-acca.idtgv.com/fr-FR')",
		);
		expect(steps[1].title).toBe(
			"page.getByLabel('Accepter & Fermer: Accepter').click()",
		);
	});

	it("truncates a multiline template-literal action to its first line", () => {
		const steps = parseRecordedSteps(KEV_SPEC);
		const aria = steps[7];
		expect(
			aria.title.startsWith("expect(page.locator('form')).toMatchAriaSnapshot"),
		).toBe(true);
		// must not contain the multiline body
		expect(aria.title).not.toContain("SNCF Voyageurs");
		expect(aria.title.includes("\n")).toBe(false);
	});

	it("does not count the import line or the test() wrapper", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('t', async ({ page }) => {
  await page.goto('about:blank');
});`;
		expect(parseRecordedSteps(spec).length).toBe(1);
	});
});
