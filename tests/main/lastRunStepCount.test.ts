import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let workspace: string;
beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "otl-lr-"));
	process.env.OTL_WORKSPACE = workspace;
});
afterEach(() => {
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	rmSync(workspace, { recursive: true, force: true });
});

it("updateLastRun persiste stepCount, relisible via getScenario", async () => {
	const { saveScenario, getScenario, updateLastRun } = await import(
		"../../src/main/stores/scenarioStore"
	);
	const scenario = {
		id: "s1",
		projectId: "p1",
		tunnelId: "t1",
		name: "S1",
		platform: "web" as const,
		browser: "chromium" as const,
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "s1.spec.ts",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastRun: { status: "never" as const },
	};
	saveScenario(scenario, "");
	updateLastRun("p1", "t1", "s1", {
		status: "passed",
		at: "2026-06-24T10:00:00.000Z",
		durationMs: 1234,
		stepCount: 11,
	});
	expect(getScenario("p1", "t1", "s1").lastRun.stepCount).toBe(11);
});
