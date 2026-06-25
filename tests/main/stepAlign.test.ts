import { describe, expect, it } from "vitest";
import { alignStepsToRecorded } from "../../src/main/runner/stepAlign";
import type { RecordedStep, ReportStep } from "../../src/shared/types";

const recorded: RecordedStep[] = [
	{ index: 0, title: "page.goto('https://x')" },
	{ index: 1, title: "page.getByLabel('Accepter').click()" },
	{ index: 2, title: "page.getByTestId('origin').click()" },
	{ index: 3, title: "page.getByTestId('submit').click()" },
];

describe("alignStepsToRecorded", () => {
	it("shows the full recorded flow with not-reached steps marked skipped", () => {
		const executed: ReportStep[] = [
			{ index: 0, title: "page.goto", status: "passed", durationMs: 120 },
			{
				index: 1,
				title: "locator.click",
				status: "failed",
				durationMs: 15000,
				error: "TimeoutError: locator.click: Timeout 15000ms exceeded.",
			},
		];
		const aligned = alignStepsToRecorded(recorded, executed, "visible");

		expect(aligned).toHaveLength(4);
		expect(aligned.map((s) => s.title)).toEqual(recorded.map((r) => r.title));
		expect(aligned.map((s) => s.status)).toEqual([
			"passed",
			"failed",
			"skipped",
			"skipped",
		]);
		expect(aligned[1].error).toContain("Timeout");
		expect(aligned[2].durationMs).toBe(0);
	});

	it("carries a screenshot on the failed step", () => {
		const executed: ReportStep[] = [
			{ index: 0, title: "g", status: "passed", durationMs: 1 },
			{
				index: 1,
				title: "c",
				status: "failed",
				durationMs: 2,
				error: "boom",
				screenshotPath: "/runs/a/shot.png",
			},
		];
		const aligned = alignStepsToRecorded(recorded, executed, "visible");
		expect(aligned[1].screenshotPath).toBe("/runs/a/shot.png");
	});

	it("skips (without consuming an executed result) steps inactive in the mode", () => {
		// Step 1 is visible-only → in INVISIBLE mode it does not run; the executed
		// results (goto, origin, submit) must align to the OTHER three steps.
		const scoped: RecordedStep[] = [
			{ index: 0, title: "page.goto('https://x')" },
			{
				index: 1,
				title: "page.getByLabel('Accepter').click()",
				scope: "visible",
			},
			{ index: 2, title: "page.getByTestId('origin').click()" },
			{ index: 3, title: "page.getByTestId('submit').click()" },
		];
		const executed: ReportStep[] = [
			{ index: 0, title: "goto", status: "passed", durationMs: 5 },
			{ index: 1, title: "origin", status: "passed", durationMs: 5 },
			{ index: 2, title: "submit", status: "passed", durationMs: 5 },
		];
		const aligned = alignStepsToRecorded(scoped, executed, "invisible");
		expect(aligned).toHaveLength(4);
		expect(aligned.map((s) => s.status)).toEqual([
			"passed", // goto
			"skipped", // Accepter — neutralised in invisible
			"passed", // origin
			"passed", // submit
		]);
		// The neutralised step carries its scope so the UI can label it.
		expect(aligned[1].scope).toBe("visible");
	});

	it("in visible mode the visible-only step DOES execute (aligns normally)", () => {
		const scoped: RecordedStep[] = [
			{ index: 0, title: "a" },
			{ index: 1, title: "b", scope: "visible" },
		];
		const executed: ReportStep[] = [
			{ index: 0, title: "a", status: "passed", durationMs: 1 },
			{ index: 1, title: "b", status: "passed", durationMs: 1 },
		];
		const aligned = alignStepsToRecorded(scoped, executed, "visible");
		expect(aligned.map((s) => s.status)).toEqual(["passed", "passed"]);
	});

	it("falls back to executed steps when nothing was recorded", () => {
		const executed: ReportStep[] = [
			{ index: 0, title: "page.goto", status: "passed", durationMs: 10 },
		];
		expect(alignStepsToRecorded([], executed, "visible")).toEqual(executed);
	});
});
