import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteReportsByProject,
	listReports,
	saveReport,
} from "../../src/main/stores/reportStore";
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
	batchId?: string,
	extra?: Partial<Report>,
): Report {
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
		...extra,
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

describe("reportStore projectId/environmentId", () => {
	it("expose projectId et environmentId dans le ReportSummary", () => {
		saveReport(
			makeReport("r3", undefined, {
				projectId: "p1",
				environmentId: "env-preprod",
			}),
		);
		const summary = listReports().find((s) => s.runId === "r3");
		expect(summary?.projectId).toBe("p1");
		expect(summary?.environmentId).toBe("env-preprod");
	});

	it("laisse projectId/environmentId indéfinis pour un rapport hérité", () => {
		saveReport(makeReport("r4"));
		const summary = listReports().find((s) => s.runId === "r4");
		expect(summary?.projectId).toBeUndefined();
		expect(summary?.environmentId).toBeUndefined();
	});
});

describe("deleteReportsByProject", () => {
	it("supprime les rapports du projet et conserve les autres", () => {
		saveReport(makeReport("a", undefined, { projectId: "p1" }));
		saveReport(makeReport("b", "lot", { projectId: "p1" }));
		saveReport(makeReport("c", undefined, { projectId: "p2" }));

		const removed = deleteReportsByProject("p1");

		expect(removed).toBe(2);
		const ids = listReports().map((s) => s.runId);
		expect(ids).toEqual(["c"]);
	});

	it("supprime aussi les rapports legacy (sans projectId) par scénario", () => {
		// Legacy report: no projectId, but its scenario belongs to the project.
		saveReport(makeReport("legacy", undefined, { scenarioId: "login" }));
		saveReport(makeReport("other", undefined, { scenarioId: "checkout" }));

		const removed = deleteReportsByProject("p1", ["login"]);

		expect(removed).toBe(1);
		expect(listReports().map((s) => s.runId)).toEqual(["other"]);
	});

	it("renvoie 0 quand aucun rapport ne correspond", () => {
		saveReport(makeReport("keep", undefined, { projectId: "p2" }));
		expect(deleteReportsByProject("p1", ["login"])).toBe(0);
		expect(listReports()).toHaveLength(1);
	});
});
