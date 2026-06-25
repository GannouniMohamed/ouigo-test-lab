import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Report, ReportSummary } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function runsDir(): string {
	return join(getWorkspaceDir(), "runs");
}

function runDir(runId: string): string {
	return join(runsDir(), runId);
}

function reportPath(runId: string): string {
	return join(runDir(runId), "report.json");
}

export function saveReport(r: Report): void {
	mkdirSync(runDir(r.runId), { recursive: true });
	writeFileSync(reportPath(r.runId), JSON.stringify(r, null, 2), "utf-8");
}

export function getReport(runId: string): Report {
	const path = reportPath(runId);
	if (!existsSync(path)) {
		throw new Error(`Report not found: ${runId}`);
	}
	return JSON.parse(readFileSync(path, "utf-8")) as Report;
}

export function listReports(scenarioId?: string): ReportSummary[] {
	const base = runsDir();
	if (!existsSync(base)) return [];

	const summaries: ReportSummary[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const rPath = join(base, entry.name, "report.json");
		if (!existsSync(rPath)) continue;
		const report = JSON.parse(readFileSync(rPath, "utf-8")) as Report;
		if (scenarioId !== undefined && report.scenarioId !== scenarioId) continue;
		summaries.push({
			runId: report.runId,
			scenarioId: report.scenarioId,
			status: report.status,
			startedAt: report.startedAt,
			durationMs: report.durationMs,
			batchId: report.batchId,
		});
	}

	// Sort newest first
	summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	return summaries;
}
