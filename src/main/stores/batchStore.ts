import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BatchReport } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function batchesDir(): string {
	return join(getWorkspaceDir(), "batches");
}

function batchPath(batchId: string): string {
	return join(batchesDir(), `${batchId}.json`);
}

export function saveBatch(b: BatchReport): void {
	mkdirSync(batchesDir(), { recursive: true });
	writeFileSync(batchPath(b.batchId), JSON.stringify(b, null, 2), "utf-8");
}

export function getBatch(batchId: string): BatchReport {
	const path = batchPath(batchId);
	if (!existsSync(path)) {
		throw new Error(`Batch not found: ${batchId}`);
	}
	return JSON.parse(readFileSync(path, "utf-8")) as BatchReport;
}
