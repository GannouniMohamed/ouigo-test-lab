import { describe, expect, it } from "vitest";
import {
	type HistoryGroup,
	downsampleRuns,
	filterGroups,
	groupReports,
} from "../../src/renderer/lib/groupReports";
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

describe("filterGroups", () => {
	const single = (status: ReportSummary["status"]): HistoryGroup => ({
		kind: "single",
		report: r({ status }),
	});
	const batch = (passed: number, total: number): HistoryGroup => ({
		kind: "batch",
		batchId: "lot",
		runs: [],
		stats: { passed, total, min: 0, avg: 0, max: 0 },
	});

	it("« all/all » ne filtre rien", () => {
		const groups = [single("passed"), batch(1, 2)];
		expect(filterGroups(groups, { status: "all", type: "all" })).toHaveLength(
			2,
		);
	});

	it("type=batch ne garde que les lots", () => {
		const groups = [single("passed"), batch(2, 2)];
		const out = filterGroups(groups, { status: "all", type: "batch" });
		expect(out).toHaveLength(1);
		expect(out[0].kind).toBe("batch");
	});

	it("type=single ne garde que les exécutions simples", () => {
		const groups = [single("passed"), batch(2, 2)];
		const out = filterGroups(groups, { status: "all", type: "single" });
		expect(out).toHaveLength(1);
		expect(out[0].kind).toBe("single");
	});

	it("status=passed: single réussi OUI, single échec NON", () => {
		const groups = [single("passed"), single("failed")];
		const out = filterGroups(groups, { status: "passed", type: "all" });
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual(single("passed"));
	});

	it("status=passed pour un lot: tout réussi OUI, partiel NON", () => {
		const groups = [batch(2, 2), batch(1, 2)];
		const out = filterGroups(groups, { status: "passed", type: "all" });
		expect(out).toHaveLength(1);
		expect(
			(out[0] as Extract<HistoryGroup, { kind: "batch" }>).stats.passed,
		).toBe(2);
	});

	it("status=failed: lot partiel OUI, single réussi NON", () => {
		const groups = [batch(1, 2), single("passed")];
		const out = filterGroups(groups, { status: "failed", type: "all" });
		expect(out).toHaveLength(1);
		expect(out[0].kind).toBe("batch");
	});
});

describe("downsampleRuns", () => {
	const runs = (n: number): ReportSummary[] =>
		Array.from({ length: n }, (_, i) => r({ runId: `run-${i}` }));

	it("renvoie la liste telle quelle quand elle tient dans max", () => {
		const list = runs(5);
		expect(downsampleRuns(list, 16)).toBe(list);
	});

	it("plafonne à max barres au-delà de la limite", () => {
		expect(downsampleRuns(runs(20), 16)).toHaveLength(16);
		expect(downsampleRuns(runs(100), 16)).toHaveLength(16);
	});

	it("conserve le premier et le dernier run", () => {
		const out = downsampleRuns(runs(20), 16);
		expect(out[0].runId).toBe("run-0");
		expect(out[out.length - 1].runId).toBe("run-19");
	});
});
