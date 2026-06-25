import { describe, expect, it } from "vitest";
import {
	makeBatchReport,
	orchestrateBatch,
} from "../../src/main/runner/batchRunner";
import type { TestRunner } from "../../src/main/runner/types";
import type {
	BatchEvent,
	BatchReport,
	Environment,
	RunResult,
	Scenario,
} from "../../src/shared/types";
import { summarizeBatch } from "../../src/shared/types";

const scenario = {
	id: "login",
	projectId: "distribution",
	tunnelId: "general",
	name: "Parcours",
	specFile: "test.spec.ts",
} as unknown as Scenario;

const env = {
	id: "acc-a",
	label: "Préprod",
	baseURL: "https://x",
	variables: {},
} as Environment;

// A fake runner that records concurrency and lets us script per-iteration
// outcomes. Each run resolves after a microtask so parallel lanes interleave.
function makeFakeRunner(
	outcomes: Array<{ status: RunResult["status"]; durationMs: number }>,
) {
	let started = 0;
	let inFlight = 0;
	let maxInFlight = 0;
	let seq = 0;
	const startOrder: string[] = [];
	const runner: TestRunner = {
		async run(_s, _e, onEvent) {
			const outcome = outcomes[started];
			started++;
			const runId = `run-${started}`;
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			startOrder.push(runId);
			onEvent({ type: "run-started", runId });
			// Yield so other lanes can start before this one resolves.
			await new Promise((r) => setTimeout(r, 1));
			inFlight--;
			seq++;
			return {
				runId,
				status: outcome.status,
				durationMs: outcome.durationMs,
				report: { runId } as RunResult["report"],
			};
		},
		async cancel() {},
	};
	return {
		runner,
		stats: () => ({ maxInFlight, startOrder }),
	};
}

function build(
	total: number,
	execution: "sequential" | "parallel",
): BatchReport {
	return makeBatchReport(
		"batch-1",
		scenario,
		env,
		execution,
		total,
		"2026-06-24T00:00:00Z",
	);
}

describe("orchestrateBatch", () => {
	it("runs every iteration sequentially (max 1 in flight) and records outcomes", async () => {
		const { runner, stats } = makeFakeRunner([
			{ status: "passed", durationMs: 100 },
			{ status: "failed", durationMs: 200 },
			{ status: "passed", durationMs: 150 },
		]);
		const report = build(3, "sequential");
		const events: BatchEvent[] = [];
		await orchestrateBatch(
			report,
			scenario,
			env,
			{ execution: "sequential", total: 3, headed: false },
			(e) => events.push(e),
			() => {},
			runner,
		);

		expect(stats().maxInFlight).toBe(1);
		expect(report.items.map((i) => i.status)).toEqual([
			"passed",
			"failed",
			"passed",
		]);
		expect(report.items.map((i) => i.runId)).toEqual([
			"run-1",
			"run-2",
			"run-3",
		]);
		expect(report.finishedAt).toBeDefined();
		expect(events[0]).toEqual({
			type: "batch-started",
			batchId: "batch-1",
			total: 3,
		});
		expect(events.at(-1)).toEqual({
			type: "batch-finished",
			batchId: "batch-1",
		});
	});

	it("runs in parallel but never exceeds two concurrent iterations", async () => {
		const { runner, stats } = makeFakeRunner(
			Array.from({ length: 6 }, () => ({
				status: "passed" as const,
				durationMs: 50,
			})),
		);
		const report = build(6, "parallel");
		await orchestrateBatch(
			report,
			scenario,
			env,
			{ execution: "parallel", total: 6, headed: false },
			() => {},
			() => {},
			runner,
		);
		expect(stats().maxInFlight).toBeLessThanOrEqual(2);
		expect(report.items.every((i) => i.status === "passed")).toBe(true);
	});

	it("persists a snapshot after each transition", async () => {
		const { runner } = makeFakeRunner([
			{ status: "passed", durationMs: 10 },
			{ status: "passed", durationMs: 10 },
		]);
		const report = build(2, "sequential");
		let persistCount = 0;
		await orchestrateBatch(
			report,
			scenario,
			env,
			{ execution: "sequential", total: 2, headed: false },
			() => {},
			() => {
				persistCount++;
			},
			runner,
		);
		// 2 starts + 2 finishes + 1 final = 5 persists.
		expect(persistCount).toBe(5);
	});
});

describe("summarizeBatch", () => {
	it("computes passed/failed and duration min/avg/max over finished items", () => {
		const stats = summarizeBatch([
			{ index: 1, status: "passed", durationMs: 100 },
			{ index: 2, status: "failed", durationMs: 300 },
			{ index: 3, status: "passed", durationMs: 200 },
			{ index: 4, status: "running" },
		]);
		expect(stats.total).toBe(4);
		expect(stats.done).toBe(3);
		expect(stats.passed).toBe(2);
		expect(stats.failed).toBe(1);
		expect(stats.minMs).toBe(100);
		expect(stats.maxMs).toBe(300);
		expect(stats.avgMs).toBe(200);
	});

	it("leaves durations undefined when nothing has finished", () => {
		const stats = summarizeBatch([
			{ index: 1, status: "pending" },
			{ index: 2, status: "running" },
		]);
		expect(stats.done).toBe(0);
		expect(stats.minMs).toBeUndefined();
		expect(stats.avgMs).toBeUndefined();
	});
});
