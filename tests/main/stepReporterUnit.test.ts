import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The reporter is CommonJS; import it via require.
const StepReporter = require("../../playwright.step-reporter.cjs");

type FakeStep = {
	category: string;
	title: string;
	duration?: number;
	error?: { message?: string };
};

function run(steps: FakeStep[]): Array<{ title: string; status: string }> {
	const reporter = new StepReporter();
	const dir = mkdtempSync(join(tmpdir(), "otl-rep-"));
	const out = join(dir, "steps.json");
	process.env.OTL_STEPS_OUT = out;
	for (const s of steps) reporter.onStepEnd({}, {}, s);
	reporter.onEnd();
	const result = JSON.parse(readFileSync(out, "utf-8"));
	rmSync(dir, { recursive: true, force: true });
	return result;
}

let saved: string | undefined;
beforeEach(() => {
	saved = process.env.OTL_STEPS_OUT;
});
afterEach(() => {
	if (saved === undefined) Reflect.deleteProperty(process.env, "OTL_STEPS_OUT");
	else process.env.OTL_STEPS_OUT = saved;
});

describe("step reporter alignment guarantees", () => {
	it("excludes the automatic failure screenshot (page.screenshot)", () => {
		const steps = run([
			{ category: "pw:api", title: "page.goto(https://x)", duration: 10 },
			{ category: "pw:api", title: "page.screenshot", duration: 5 },
		]);
		expect(steps.map((s) => s.title)).toEqual(["page.goto(https://x)"]);
	});

	it("stops collecting after the first failed step (teardown does not shift alignment)", () => {
		const steps = run([
			{ category: "pw:api", title: "page.goto(https://x)", duration: 10 },
			{
				category: "pw:api",
				title: "locator.getByLabel('Accepter').click",
				duration: 6000,
				error: { message: "TimeoutError: locator.click: Timeout 6000ms" },
			},
			// Everything below is teardown after the failure and must be ignored.
			{ category: "pw:api", title: "page.screenshot", duration: 5 },
			{
				category: "pw:api",
				title: "page.getByTestId('origin').click",
				duration: 3,
			},
		]);
		expect(steps).toHaveLength(2);
		expect(steps[0].status).toBe("passed");
		expect(steps[1].status).toBe("failed");
	});

	it("still excludes browser*/hook/fixture infra steps", () => {
		const steps = run([
			{ category: "hook", title: "Before Hooks", duration: 1 },
			{ category: "pw:api", title: "browserContext.newPage", duration: 1 },
			{ category: "pw:api", title: "page.goto(https://x)", duration: 1 },
			{ category: "expect", title: "expect.toBeVisible", duration: 1 },
		]);
		expect(steps.map((s) => s.title)).toEqual([
			"page.goto(https://x)",
			"expect.toBeVisible",
		]);
	});
});
