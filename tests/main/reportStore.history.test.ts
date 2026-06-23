import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listReports, saveReport } from "../../src/main/stores/reportStore";
import type { Report } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

function makeReport(
	runId: string,
	scenarioId: string,
	startedAt: string,
): Report {
	return {
		runId,
		scenarioId,
		scenarioName: scenarioId,
		environmentLabel: "preprod",
		status: "passed",
		durationMs: 1000,
		startedAt,
		steps: [],
	};
}

describe("reportStore.listReports", () => {
	it("listReports(scenarioId) retourne 2 entrées triées newest-first", () => {
		saveReport(makeReport("r1", "login", "2026-06-23T10:00:00Z"));
		saveReport(makeReport("r2", "login", "2026-06-23T12:00:00Z"));
		saveReport(makeReport("r3", "buy", "2026-06-23T11:00:00Z"));

		const results = listReports("login");
		expect(results).toHaveLength(2);
		// newest first
		expect(results[0].startedAt).toBe("2026-06-23T12:00:00Z");
		expect(results[1].startedAt).toBe("2026-06-23T10:00:00Z");
	});

	it("listReports() sans filtre retourne tous les rapports", () => {
		saveReport(makeReport("r1", "login", "2026-06-23T10:00:00Z"));
		saveReport(makeReport("r2", "login", "2026-06-23T12:00:00Z"));
		saveReport(makeReport("r3", "buy", "2026-06-23T11:00:00Z"));

		const results = listReports();
		expect(results).toHaveLength(3);
	});
});
