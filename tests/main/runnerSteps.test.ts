import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCustomSteps } from "../../src/main/runner/playwrightRunner";
import type { ReportStep } from "../../src/shared/types";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-steps-unit-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("readCustomSteps", () => {
	it("retourne null si le fichier n'existe pas", () => {
		const result = readCustomSteps(join(dir, "nonexistent.json"));
		expect(result).toBeNull();
	});

	it("retourne null si le JSON est invalide", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(stepsOut, "not-valid-json", "utf-8");
		expect(readCustomSteps(stepsOut)).toBeNull();
	});

	it("retourne null si le JSON n'est pas un tableau", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(stepsOut, JSON.stringify({ foo: "bar" }), "utf-8");
		expect(readCustomSteps(stepsOut)).toBeNull();
	});

	it("mappe correctement les étapes passantes", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{ title: "page.goto", durationMs: 100, status: "passed" },
				{ title: "expect.toHaveText", durationMs: 50, status: "passed" },
			]),
			"utf-8",
		);
		const steps = readCustomSteps(stepsOut);
		expect(steps).not.toBeNull();
		expect(steps?.length).toBe(2);
		expect(steps?.[0]).toMatchObject({
			index: 0,
			title: "page.goto",
			status: "passed",
			durationMs: 100,
		});
		expect(steps?.[1]).toMatchObject({
			index: 1,
			title: "expect.toHaveText",
			status: "passed",
			durationMs: 50,
		});
		// Étapes passantes n'ont pas de champ error
		expect(steps?.[0].error).toBeUndefined();
		expect(steps?.[1].error).toBeUndefined();
	});

	it("mappe correctement une étape échouée avec message d'erreur", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{
					title: "expect.toHaveText",
					durationMs: 30,
					status: "failed",
					error: "Expected 'Bonjour' but got 'Hello'",
				},
			]),
			"utf-8",
		);
		const steps = readCustomSteps(stepsOut);
		expect(steps).not.toBeNull();
		expect(steps?.[0]).toMatchObject({
			index: 0,
			status: "failed",
			error: "Expected 'Bonjour' but got 'Hello'",
		});
	});

	it("utilise durationMs=0 si absent dans le fichier", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([{ title: "page.click", status: "passed" }]),
			"utf-8",
		);
		const steps = readCustomSteps(stepsOut);
		expect(steps?.[0].durationMs).toBe(0);
	});

	it("traite un statut inconnu comme 'passed'", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([{ title: "page.click", status: "skipped" }]),
			"utf-8",
		);
		const steps = readCustomSteps(stepsOut);
		expect(steps?.[0].status).toBe("passed");
	});

	it("assigne des indices séquentiels", () => {
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{ title: "step A", status: "passed" },
				{ title: "step B", status: "passed" },
				{ title: "step C", status: "passed" },
			]),
			"utf-8",
		);
		const steps = readCustomSteps(stepsOut);
		expect(steps?.map((s) => s.index)).toEqual([0, 1, 2]);
	});
});

describe("logique de remplacement des steps et préservation de la capture d'écran", () => {
	it("les custom steps non vides remplacent les steps JSON-mappés", () => {
		// Simulate what the runner does: JSON-mapped report has steps from PW JSON
		const jsonMappedSteps: ReportStep[] = [
			{
				index: 0,
				title: "Before All Hook",
				status: "passed",
				durationMs: 10,
			},
		];

		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{ title: "page.goto", durationMs: 200, status: "passed" },
				{ title: "expect.toHaveTitle", durationMs: 80, status: "passed" },
			]),
			"utf-8",
		);

		const customSteps = readCustomSteps(stepsOut);
		const finalSteps =
			customSteps && customSteps.length > 0 ? customSteps : jsonMappedSteps;

		expect(finalSteps.length).toBe(2);
		expect(finalSteps[0].title).toBe("page.goto");
		expect(finalSteps[1].title).toBe("expect.toHaveTitle");
	});

	it("null/vide garde les steps JSON-mappés intacts", () => {
		const jsonMappedSteps: ReportStep[] = [
			{ index: 0, title: "Before All Hook", status: "passed", durationMs: 10 },
		];

		// No steps file → readCustomSteps returns null
		const nullSteps = readCustomSteps(join(dir, "missing.json"));
		const finalStepsNull =
			nullSteps && nullSteps.length > 0 ? nullSteps : jsonMappedSteps;
		expect(finalStepsNull).toBe(jsonMappedSteps);

		// Empty array → also keep JSON steps
		const stepsOut = join(dir, "steps.json");
		writeFileSync(stepsOut, JSON.stringify([]), "utf-8");
		const emptySteps = readCustomSteps(stepsOut);
		const finalStepsEmpty =
			emptySteps && emptySteps.length > 0 ? emptySteps : jsonMappedSteps;
		expect(finalStepsEmpty).toBe(jsonMappedSteps);
	});

	it("la capture d'écran de l'étape échouée JSON est transférée à la première étape échouée custom", () => {
		// JSON-mapped report has a failed step with screenshotPath
		const screenshotPath = "/workspace/runs/abc/artifacts/screenshot.png";
		const jsonMappedSteps: ReportStep[] = [
			{
				index: 0,
				title: "Before All Hook",
				status: "passed",
				durationMs: 10,
			},
			{
				index: 1,
				title: "expect.toHaveText",
				status: "failed",
				durationMs: 30,
				error: "Expected text mismatch",
				screenshotPath,
			},
		];

		// Custom steps from OTL_STEPS_OUT — no screenshotPath on them
		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{ title: "page.goto", durationMs: 200, status: "passed" },
				{
					title: "expect.toHaveText",
					durationMs: 30,
					status: "failed",
					error: "Expected text mismatch",
				},
			]),
			"utf-8",
		);

		const customSteps = readCustomSteps(stepsOut);
		expect(customSteps).not.toBeNull();
		expect(customSteps?.length).toBe(2);

		// Simulate the runner's screenshot-preservation logic
		const failedJsonStep = jsonMappedSteps.find(
			(s) => s.status === "failed" && s.screenshotPath !== undefined,
		);
		const preservedScreenshot = failedJsonStep?.screenshotPath;

		if (customSteps && customSteps.length > 0) {
			if (preservedScreenshot !== undefined) {
				const firstFailedCustomStep = customSteps.find(
					(s) => s.status === "failed",
				);
				if (firstFailedCustomStep !== undefined) {
					firstFailedCustomStep.screenshotPath = preservedScreenshot;
				}
			}
		}

		// The first failed custom step now carries the screenshotPath
		const firstFailed = customSteps?.find((s) => s.status === "failed");
		expect(firstFailed?.screenshotPath).toBe(screenshotPath);
		// Passed steps remain without screenshotPath
		const passedStep = customSteps?.find((s) => s.status === "passed");
		expect(passedStep?.screenshotPath).toBeUndefined();
	});

	it("préservation de la capture d'écran ne plante pas si aucune étape JSON échouée n'a de screenshot", () => {
		// JSON-mapped report with no screenshot
		const jsonMappedSteps: ReportStep[] = [
			{
				index: 0,
				title: "expect.toHaveText",
				status: "failed",
				durationMs: 30,
				error: "mismatch",
				// no screenshotPath
			},
		];

		const stepsOut = join(dir, "steps.json");
		writeFileSync(
			stepsOut,
			JSON.stringify([
				{
					title: "expect.toHaveText",
					durationMs: 30,
					status: "failed",
					error: "mismatch",
				},
			]),
			"utf-8",
		);

		const customSteps = readCustomSteps(stepsOut);
		const failedJsonStep = jsonMappedSteps.find(
			(s) => s.status === "failed" && s.screenshotPath !== undefined,
		);
		const preservedScreenshot = failedJsonStep?.screenshotPath;

		// preservedScreenshot is undefined → no transfer attempted
		expect(preservedScreenshot).toBeUndefined();

		if (customSteps && customSteps.length > 0) {
			if (preservedScreenshot !== undefined) {
				const firstFailed = customSteps.find((s) => s.status === "failed");
				if (firstFailed !== undefined) {
					firstFailed.screenshotPath = preservedScreenshot;
				}
			}
		}

		const firstFailed = customSteps?.find((s) => s.status === "failed");
		expect(firstFailed?.screenshotPath).toBeUndefined();
	});
});
