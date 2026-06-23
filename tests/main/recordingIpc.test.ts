import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleStartRecording,
	handleStopRecording,
} from "../../src/main/ipc/recordingHandlers";
import { saveEnvironment } from "../../src/main/stores/environmentStore";
import { listScenarios } from "../../src/main/stores/scenarioStore";

const REPO = resolve(__dirname, "../..");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-recipc-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_CODEGEN = "node";
	process.env.OTL_CODEGEN_ARGS = resolve(
		REPO,
		"tests/fixtures/fake-codegen.mjs",
	);
	saveEnvironment({
		id: "local",
		label: "Local",
		baseURL: "https://x.example",
		variables: {},
	});
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN_ARGS");
});

describe("recording IPC handlers", () => {
	it("start puis stop crée et persiste un scénario", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Via IPC",
			browser: "chromium",
			environmentId: "local",
		});
		expect(recordingId).toBeTruthy();
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await handleStopRecording(recordingId);
		expect(scenario.name).toBe("Via IPC");
		expect(listScenarios()).toHaveLength(1);
	}, 15000);
});
