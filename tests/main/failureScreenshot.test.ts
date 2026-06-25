import { describe, expect, it } from "vitest";
import { extractFailureScreenshot } from "../../src/main/runner/reportMapper";

// A flat recorded spec: the failing result has the screenshot attachment but
// NO steps (the very case where the old step-based extraction lost it).
const flatFailedReport = {
	suites: [
		{
			title: "last.spec.ts",
			specs: [
				{
					title: "test",
					ok: false,
					tests: [
						{
							results: [
								{
									status: "failed",
									duration: 6000,
									steps: [],
									attachments: [
										{
											name: "screenshot",
											path: "/runs/abc/artifacts/last-test/test-failed-1.png",
											contentType: "image/png",
										},
									],
								},
							],
						},
					],
				},
			],
		},
	],
};

describe("extractFailureScreenshot", () => {
	it("reads the screenshot from a failed result that has no steps", () => {
		expect(extractFailureScreenshot(flatFailedReport)).toBe(
			"/runs/abc/artifacts/last-test/test-failed-1.png",
		);
	});

	it("returns undefined when there is no failure screenshot", () => {
		const passed = {
			suites: [
				{
					title: "s",
					specs: [
						{
							title: "t",
							ok: true,
							tests: [
								{ results: [{ status: "passed", duration: 1, steps: [] }] },
							],
						},
					],
				},
			],
		};
		expect(extractFailureScreenshot(passed)).toBeUndefined();
	});

	it("returns undefined for an invalid report shape", () => {
		expect(extractFailureScreenshot(null)).toBeUndefined();
		expect(extractFailureScreenshot({})).toBeUndefined();
	});
});
