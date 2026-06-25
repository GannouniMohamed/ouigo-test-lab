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

function makeReport(runId: string, batchId?: string): Report {
	return {
		runId,
		scenarioId: "login",
		scenarioName: "login",
		environmentLabel: "preprod",
		status: "passed",
		durationMs: 1000,
		startedAt: "2026-06-25T10:00:00Z",
		steps: [],
		...(batchId !== undefined ? { batchId } : {}),
	};
}

describe("reportStore batchId", () => {
	it("expose le batchId dans le ReportSummary quand le run appartient à un lot", () => {
		saveReport(makeReport("r1", "batch-42"));
		const summary = listReports().find((s) => s.runId === "r1");
		expect(summary?.batchId).toBe("batch-42");
	});

	it("laisse batchId indéfini pour un run simple", () => {
		saveReport(makeReport("r2"));
		const summary = listReports().find((s) => s.runId === "r2");
		expect(summary?.batchId).toBeUndefined();
	});
});
