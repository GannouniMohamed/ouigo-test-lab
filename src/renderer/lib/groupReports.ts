import type { ReportSummary } from "../../shared/types";

export type HistoryGroup =
	| { kind: "single"; report: ReportSummary }
	| {
			kind: "batch";
			batchId: string;
			runs: ReportSummary[];
			stats: {
				passed: number;
				total: number;
				min: number;
				avg: number;
				max: number;
			};
	  };

// Group a newest-first list of report summaries by their batchId (lot). Reports
// without a batchId become standalone "single" groups; reports sharing a batchId
// collapse into one "batch" group with aggregate stats. The first occurrence of
// each batch fixes its position in the output, so input order is preserved.
export function groupReports(reports: ReportSummary[]): HistoryGroup[] {
	const groups: HistoryGroup[] = [];
	const batchIndex = new Map<string, number>();

	for (const report of reports) {
		if (!report.batchId) {
			groups.push({ kind: "single", report });
			continue;
		}
		const existing = batchIndex.get(report.batchId);
		if (existing === undefined) {
			batchIndex.set(report.batchId, groups.length);
			groups.push({
				kind: "batch",
				batchId: report.batchId,
				runs: [report],
				stats: { passed: 0, total: 0, min: 0, avg: 0, max: 0 },
			});
		} else {
			const g = groups[existing];
			if (g.kind === "batch") g.runs.push(report);
		}
	}

	for (const g of groups) {
		if (g.kind !== "batch") continue;
		g.stats = computeStats(g.runs);
	}

	return groups;
}

function computeStats(runs: ReportSummary[]): {
	passed: number;
	total: number;
	min: number;
	avg: number;
	max: number;
} {
	const total = runs.length;
	const passed = runs.filter((r) => r.status === "passed").length;
	if (total === 0) {
		return { passed: 0, total: 0, min: 0, avg: 0, max: 0 };
	}
	const durations = runs.map((r) => r.durationMs);
	const min = Math.min(...durations);
	const max = Math.max(...durations);
	const sum = durations.reduce((a, b) => a + b, 0);
	const avg = Math.round(sum / total);
	return { passed, total, min, avg, max };
}
