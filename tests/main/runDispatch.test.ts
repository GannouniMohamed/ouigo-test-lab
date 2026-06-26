import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRunScenario } from "../../src/main/ipc/handlers";
import * as projectStore from "../../src/main/stores/projectStore";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Project, RunEvent, Scenario } from "../../src/shared/types";

const FAKE = resolve(process.cwd(), "tests/fixtures/fake-maestro.mjs");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-disp-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_MAESTRO_BIN = process.execPath;
	process.env.OTL_MAESTRO_BIN_ARGS = FAKE;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_MAESTRO_BIN", "OTL_MAESTRO_BIN_ARGS"])
		Reflect.deleteProperty(process.env, k);
});

describe("handleRunScenario — dispatch par plateforme", () => {
	it("un scénario mobile passe par maestroRunner (rapport via la fausse CLI)", async () => {
		const project: Project = {
			id: "p1",
			name: "P",
			description: "",
			createdAt: "2026-06-26T00:00:00Z",
			environments: [
				{
					id: "preprod",
					label: "Préprod",
					baseURL: "",
					variables: {},
					app: { appId: "com.ouigo.app", source: "installed" },
				},
			],
		};
		projectStore.saveProject(project);
		const scenario: Scenario = {
			id: "parcours",
			projectId: "p1",
			tunnelId: "general",
			name: "Parcours",
			platform: "mobile",
			browser: "chromium",
			defaultEnvironmentId: "preprod",
			tags: [],
			specFile: "parcours.flow.yaml",
			createdAt: "2026-06-26T00:00:00Z",
			lastRun: { status: "never" },
		};
		saveScenario(scenario, "appId: x\n---\n- launchApp\n");

		const events: RunEvent[] = [];
		const { runId } = await handleRunScenario(
			"p1",
			"general",
			"parcours",
			"preprod",
			(_ch, ev) => events.push(ev),
			{ deviceId: "emulator-5554" },
		);
		expect(runId).toBeTruthy();
		// laisse le run se terminer
		await new Promise((r) => setTimeout(r, 300));
		expect(events.some((e) => e.type === "run-finished")).toBe(true);
	});
});
