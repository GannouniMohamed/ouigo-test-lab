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

export type StatusFilter = "all" | "passed" | "failed";
export type TypeFilter = "all" | "batch" | "single";

export interface HistoryFilters {
	status: StatusFilter;
	type: TypeFilter;
}

// Filter grouped history at the group level. Type narrows to lots or singles.
// Status: a single matches its own status; a lot is "passed" only when every run
// passed, "failed" as soon as one run failed.
export function filterGroups(
	groups: HistoryGroup[],
	filters: HistoryFilters,
): HistoryGroup[] {
	return groups.filter((g) => {
		if (filters.type !== "all" && g.kind !== filters.type) return false;
		if (filters.status === "all") return true;
		const allPassed =
			g.kind === "single"
				? g.report.status === "passed"
				: g.stats.passed === g.stats.total;
		return filters.status === "passed" ? allPassed : !allPassed;
	});
}

// Downsample a run list to at most `max` bars, evenly spaced, always keeping the
// last run so the most recent result stays visible. Prevents the sparkline from
// overflowing its fixed-width box on large parallel lots.
export function downsampleRuns(
	runs: ReportSummary[],
	max: number,
): ReportSummary[] {
	if (max <= 1) return runs.slice(-1);
	if (runs.length <= max) return runs;
	const step = (runs.length - 1) / (max - 1);
	const result: ReportSummary[] = [];
	for (let i = 0; i < max; i++) {
		result.push(runs[Math.round(i * step)]);
	}
	return result;
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
