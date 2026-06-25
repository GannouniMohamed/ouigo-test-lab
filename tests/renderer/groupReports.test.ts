import { describe, expect, it } from "vitest";
import { groupReports } from "../../src/renderer/lib/groupReports";
import type { ReportSummary } from "../../src/shared/types";

function r(over: Partial<ReportSummary>): ReportSummary {
	return {
		runId: "run",
		scenarioId: "login",
		status: "passed",
		startedAt: "2026-06-23T10:00:00Z",
		durationMs: 1000,
		...over,
	};
}

describe("groupReports", () => {
	it("renvoie [] pour une entrée vide", () => {
		expect(groupReports([])).toEqual([]);
	});

	it("traite les reports sans batchId comme des singles", () => {
		const groups = groupReports([r({ runId: "a" }), r({ runId: "b" })]);
		expect(groups).toHaveLength(2);
		expect(groups.every((g) => g.kind === "single")).toBe(true);
		expect(
			groups.map((g) => (g.kind === "single" ? g.report.runId : null)),
		).toEqual(["a", "b"]);
	});

	it("regroupe les runs partageant un batchId avec stats correctes", () => {
		const groups = groupReports([
			r({ runId: "x1", batchId: "lot1", status: "passed", durationMs: 2000 }),
			r({ runId: "x2", batchId: "lot1", status: "failed", durationMs: 4000 }),
			r({ runId: "x3", batchId: "lot1", status: "passed", durationMs: 6000 }),
		]);
		expect(groups).toHaveLength(1);
		const g = groups[0];
		expect(g.kind).toBe("batch");
		if (g.kind !== "batch") throw new Error("expected batch");
		expect(g.batchId).toBe("lot1");
		expect(g.runs).toHaveLength(3);
		expect(g.stats).toEqual({
			passed: 2,
			total: 3,
			min: 2000,
			avg: 4000,
			max: 6000,
		});
	});

	it("préserve l'ordre de première occurrence (le lot apparaît à sa 1re ligne)", () => {
		const groups = groupReports([
			r({ runId: "s1" }),
			r({ runId: "b1", batchId: "lot" }),
			r({ runId: "s2" }),
			r({ runId: "b2", batchId: "lot" }),
		]);
		expect(groups).toHaveLength(3);
		expect(groups[0]).toMatchObject({ kind: "single" });
		expect(groups[1]).toMatchObject({ kind: "batch", batchId: "lot" });
		expect(groups[2]).toMatchObject({ kind: "single" });
		if (groups[1].kind === "batch") {
			expect(groups[1].runs.map((x) => x.runId)).toEqual(["b1", "b2"]);
		}
	});

	it("ne produit pas de NaN pour un lot à un seul run", () => {
		const groups = groupReports([
			r({ runId: "only", batchId: "solo", durationMs: 1500 }),
		]);
		const g = groups[0];
		if (g.kind !== "batch") throw new Error("expected batch");
		expect(g.stats).toEqual({
			passed: 1,
			total: 1,
			min: 1500,
			avg: 1500,
			max: 1500,
		});
		expect(Number.isNaN(g.stats.avg)).toBe(false);
	});
});
