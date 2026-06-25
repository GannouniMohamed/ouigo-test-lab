import { describe, expect, it } from "vitest";
import {
	compileSpecForMode,
	deleteStep,
	editStep,
	parseRecordedSteps,
	setStepScope,
} from "../../src/shared/spec";

const SPEC = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://x');
  await expect(page.getByRole('heading', { name: 'Bienvenue chez OUIGO !' })).toBeVisible();
  await page.getByLabel('Accepter & Fermer: Accepter').click();
  await page.getByTestId('e2e_submit-button').click();
});
`;

describe("specEdit (scope-aware)", () => {
	it("deleteStep removes exactly that action and renumbers", () => {
		const next = deleteStep(SPEC, 1);
		const steps = parseRecordedSteps(next);
		expect(steps).toHaveLength(3);
		expect(next).not.toContain("Bienvenue chez OUIGO");
	});

	it("setStepScope('visible') annotates the line; parser reports the scope; count kept", () => {
		const next = setStepScope(SPEC, 1, "visible");
		expect(next).toContain(
			"// [otl:visible] await expect(page.getByRole('heading'",
		);
		const steps = parseRecordedSteps(next);
		expect(steps).toHaveLength(4); // scoped step is kept
		expect(steps[1].scope).toBe("visible");
		expect(steps[0].scope).toBeUndefined(); // both → omitted
		expect(steps[1].title).toContain("expect(page.getByRole('heading'");
	});

	it("setStepScope('both') re-activates a scoped step", () => {
		const scoped = setStepScope(SPEC, 2, "invisible");
		expect(parseRecordedSteps(scoped)[2].scope).toBe("invisible");
		const back = setStepScope(scoped, 2, "both");
		expect(parseRecordedSteps(back)[2].scope).toBeUndefined();
		expect(back).not.toContain("[otl:");
	});

	it("editStep replaces the statement and preserves the step's scope", () => {
		const scoped = setStepScope(SPEC, 2, "visible");
		const edited = editStep(
			scoped,
			2,
			"page.getByRole('button', { name: 'Accepter' }).click()",
		);
		expect(parseRecordedSteps(edited)[2].scope).toBe("visible");
		expect(edited).toContain(
			"// [otl:visible] await page.getByRole('button', { name: 'Accepter' }).click();",
		);
	});

	it("throws on out-of-range index", () => {
		expect(() => deleteStep(SPEC, 99)).toThrow(/out of range/);
	});
});

describe("compileSpecForMode", () => {
	it("activates visible-only steps in visible mode, comments them in invisible", () => {
		const src = setStepScope(SPEC, 1, "visible"); // heading assert → visible-only
		const visible = compileSpecForMode(src, "visible");
		const invisible = compileSpecForMode(src, "invisible");

		// visible run: the step is active (no leading comment)
		expect(visible).toContain(
			"  await expect(page.getByRole('heading', { name: 'Bienvenue chez OUIGO !' })).toBeVisible();",
		);
		// invisible run: the step is commented out
		expect(invisible).toContain(
			"  // await expect(page.getByRole('heading', { name: 'Bienvenue chez OUIGO !' })).toBeVisible();",
		);
	});

	it("invisible-only steps run only in invisible mode", () => {
		const src = setStepScope(SPEC, 3, "invisible");
		expect(compileSpecForMode(src, "invisible")).toContain(
			"  await page.getByTestId('e2e_submit-button').click();",
		);
		expect(compileSpecForMode(src, "visible")).toContain(
			"  // await page.getByTestId('e2e_submit-button').click();",
		);
	});

	it("skip steps are commented in both modes; both steps active in both", () => {
		const src = setStepScope(SPEC, 2, "skip");
		for (const mode of ["visible", "invisible"] as const) {
			const out = compileSpecForMode(src, mode);
			expect(out).toContain("  // await page.getByLabel('Accepter");
			expect(out).toContain("  await page.goto('https://x');"); // both → active
		}
	});

	it("leaves non-action lines untouched", () => {
		const out = compileSpecForMode(SPEC, "visible");
		expect(out).toContain("import { test, expect } from '@playwright/test';");
		expect(out).toContain("test('test', async ({ page }) => {");
	});
});
