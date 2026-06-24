import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRecorder } from "../../src/main/recorder/playwrightRecorder";
import { saveProject } from "../../src/main/stores/projectStore";
import { getScenario } from "../../src/main/stores/scenarioStore";
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
	dir = mkdtempSync(join(tmpdir(), "otl-rec-stop-"));
	process.env.OTL_WORKSPACE = dir;
	seedDefaultProject("https://x.example");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN");
	Reflect.deleteProperty(process.env, "OTL_CODEGEN_ARGS");
});

describe("graceful codegen stop", () => {
	it("captures the last action even when the spec file is written with a delay (300ms)", async () => {
		// Use the delayed-codegen fixture: it writes the spec 300ms after launch.
		// stopRecording now waits up to 700ms after SIGTERM, so the delayed write
		// lands and is read — proving the last action is not lost.
		process.env.OTL_CODEGEN = "node";
		process.env.OTL_CODEGEN_ARGS = resolve(
			REPO,
			"tests/fixtures/delayed-codegen.mjs",
		);

		const { recordingId } = await playwrightRecorder.startRecording({
			name: "Graceful Stop Test",
			browser: "chromium",
			environmentId: "local",
			projectId: "default",
			tunnelId: "general",
		});

		// Stop immediately — before the 300ms delay elapses, so the file does not
		// yet exist when stopRecording begins polling. The poller waits for the
		// file, then the graceful stop waits another ~700ms for the process to
		// flush and exit. Net result: the delayed action IS captured.
		const scenario = await playwrightRecorder.stopRecording(recordingId);

		expect(scenario.name).toBe("Graceful Stop Test");
		expect(scenario.specFile).toMatch(/\.spec\.ts$/);

		// Verify the saved spec contains the recognisable delayed action.
		// saveScenario writes to: projects/<projectId>/tunnels/<tunnelId>/scenarios/<id>/<specFile>
		const savedSpec = readFileSync(
			join(
				dir,
				"projects",
				"default",
				"tunnels",
				"general",
				"scenarios",
				scenario.id,
				scenario.specFile,
			),
			"utf-8",
		);
		expect(savedSpec).toContain("getByRole");
		expect(savedSpec).toContain("click");

		// Scenario is also retrievable from the store.
		const stored = getScenario("default", "general", scenario.id);
		expect(stored.specFile).toBe(scenario.specFile);
	}, 20000);
});
