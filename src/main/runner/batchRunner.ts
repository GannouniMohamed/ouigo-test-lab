import type {
	BatchEvent,
	BatchExecutionMode,
	BatchItem,
	BatchOptions,
	BatchReport,
	Environment,
	RunEvent,
	RunMode,
	Scenario,
} from "../../shared/types";
import { playwrightRunner } from "./playwrightRunner";
import type { TestRunner } from "./types";

// Parallel execution never exceeds two concurrent runs: more would thrash a
// weak tester machine and the extra browser sessions pollute the very KPI /
// tracking signals the batch exists to measure.
export const PARALLEL_LIMIT = 2;

// Derive the run mode the same way playwrightRunner does, so the batch label
// matches what actually executes (OTL_FORCE_HEADLESS wins for CI/e2e).
export function batchMode(headed?: boolean): RunMode {
	const headless = process.env.OTL_FORCE_HEADLESS === "1" || headed === false;
	return headless ? "invisible" : "visible";
}

export function makeBatchReport(
	batchId: string,
	scenario: Scenario,
	env: Environment,
	execution: BatchExecutionMode,
	total: number,
	startedAt: string,
): BatchReport {
	return {
		batchId,
		scenarioId: scenario.id,
		scenarioName: scenario.name,
		projectId: scenario.projectId,
		tunnelId: scenario.tunnelId,
		environmentId: env.id,
		environmentLabel: env.label,
		mode: batchMode(undefined),
		execution,
		total,
		startedAt,
		items: Array.from({ length: total }, (_, i) => ({
			index: i + 1,
			status: "pending" as const,
		})),
	};
}

// Run `items` through `worker` with at most `limit` in flight at once.
async function runWithPool<T>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	let cursor = 0;
	const pump = async (): Promise<void> => {
		while (cursor < items.length) {
			const i = cursor++;
			await worker(items[i]);
		}
	};
	const lanes = Math.min(limit, items.length);
	await Promise.all(Array.from({ length: lanes }, () => pump()));
}

// Orchestrate a batch: run each iteration through the existing single-run
// pipeline (so every iteration yields a full, drill-downable Report), update
// the shared BatchReport in place, persist a snapshot after every transition
// (so a freshly-opened summary screen recovers missed live events), and emit
// batch events for the live view.
export async function orchestrateBatch(
	report: BatchReport,
	scenario: Scenario,
	env: Environment,
	options: BatchOptions,
	onEvent: (e: BatchEvent) => void,
	persist: (r: BatchReport) => void,
	runner: TestRunner = playwrightRunner,
): Promise<BatchReport> {
	report.mode = batchMode(options.headed);
	onEvent({
		type: "batch-started",
		batchId: report.batchId,
		total: report.total,
	});

	const runItem = (item: BatchItem): Promise<void> => {
		item.status = "running";
		return new Promise<void>((resolveItem) => {
			let announced = false;
			void runner
				.run(
					scenario,
					env,
					(ev: RunEvent) => {
						if (ev.type === "run-started" && !announced) {
							announced = true;
							item.runId = ev.runId;
							onEvent({
								type: "item-started",
								index: item.index,
								runId: ev.runId,
							});
							persist(report);
						}
					},
					{ headed: options.headed },
				)
				.then((res) => {
					item.runId = res.runId;
					item.status = res.status; // RunStatus ⊂ BatchItemStatus
					item.durationMs = res.durationMs;
					onEvent({
						type: "item-finished",
						index: item.index,
						runId: res.runId,
						status: res.status,
						durationMs: res.durationMs,
					});
					persist(report);
					resolveItem();
				});
		});
	};

	if (options.execution === "parallel") {
		await runWithPool(report.items, PARALLEL_LIMIT, runItem);
	} else {
		for (const item of report.items) {
			await runItem(item);
		}
	}

	report.finishedAt = new Date().toISOString();
	persist(report);
	onEvent({ type: "batch-finished", batchId: report.batchId });
	return report;
}
