import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRecorder } from "../../src/main/recorder/playwrightRecorder";
import { saveProject } from "../../src/main/stores/projectStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";

const REPO = resolve(__dirname, "../..");
let dir: string;

function seedDefaultProject(baseURL: string): void {
	saveProject({
		id: "default",
		name: "Projet par défaut",
		description: "",
		environments: [{ id: "local", label: "Local", baseURL, variables: {} }],
		createdAt: "2026-06-24T00:00:00Z",
	});
	saveTunnel({
		id: "general",
		projectId: "default",
		name: "Général",
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
		order: 0,
		createdAt: "2026-06-24T00:00:00Z",
	});
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-platform-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_CODEGEN = "node";
	process.env.OTL_CODEGEN_ARGS = resolve(
		REPO,
		"tests/fixtures/fake-codegen.mjs",
	);
	seedDefaultProject("https://x.example");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN_ARGS");
});

describe("platform round-trip", () => {
	it('persists platform "responsive" when provided', async () => {
		const { recordingId } = await playwrightRecorder.startRecording({
			name: "Responsive Test",
			browser: "chromium",
			environmentId: "local",
			projectId: "default",
			tunnelId: "general",
			platform: "responsive",
		});
		expect(recordingId).toBeTruthy();
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await playwrightRecorder.stopRecording(recordingId);
		expect(scenario.platform).toBe("responsive");
	}, 15000);

	it('defaults platform to "web" when not provided', async () => {
		const { recordingId } = await playwrightRecorder.startRecording({
			name: "Default Platform Test",
			browser: "chromium",
			environmentId: "local",
			projectId: "default",
			tunnelId: "general",
		});
		expect(recordingId).toBeTruthy();
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await playwrightRecorder.stopRecording(recordingId);
		expect(scenario.platform).toBe("web");
	}, 15000);
});
