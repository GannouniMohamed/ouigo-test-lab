import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maestroRunner } from "../../src/main/runner/maestroRunner";
import { saveScenario } from "../../src/main/stores/scenarioStore";
import type { Environment, RunEvent, Scenario } from "../../src/shared/types";

const FAKE = resolve(process.cwd(), "tests/fixtures/fake-maestro.mjs");
let dir: string;

function mobileEnv(over: Partial<Environment> = {}): Environment {
	return {
		id: "preprod",
		label: "Préprod",
		baseURL: "",
		variables: {},
		app: { appId: "com.ouigo.app", source: "installed" },
		...over,
	};
}

function mobileScenario(): Scenario {
	return {
		id: "parcours",
		projectId: "p1",
		tunnelId: "general",
		name: "Parcours mobile",
		platform: "mobile",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "parcours.flow.yaml",
		createdAt: "2026-06-26T00:00:00Z",
		lastRun: { status: "never" },
	};
}

const FLOW = `appId: com.recorded
---
- launchApp
- assertVisible: "Bienvenue"
`;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mrun-"));
	process.env.OTL_WORKSPACE = dir;
	// pointe maestro sur la fixture node (cross-platform)
	process.env.OTL_MAESTRO_BIN = process.execPath;
	process.env.OTL_MAESTRO_BIN_ARGS = FAKE;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of [
		"OTL_WORKSPACE",
		"OTL_MAESTRO_BIN",
		"OTL_MAESTRO_BIN_ARGS",
		"OTL_FAKE_MAESTRO_FAIL",
	])
		Reflect.deleteProperty(process.env, k);
});

describe("maestroRunner", () => {
	it("run passant : émet run-started/run-finished, persiste un rapport vert", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const events: RunEvent[] = [];
		const res = await maestroRunner.run(
			scenario,
			mobileEnv(),
			(e) => events.push(e),
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("passed");
		expect(events[0].type).toBe("run-started");
		expect(events.at(-1)).toMatchObject({
			type: "run-finished",
			status: "passed",
		});
	});

	it("run échouant : statut failed", async () => {
		process.env.OTL_FAKE_MAESTRO_FAIL = "1";
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {}, {
			deviceId: "emulator-5554",
		});
		expect(res.status).toBe("failed");
	});

	it("sans deviceId → rapport d'échec mappé (pas d'exception)", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {});
		expect(res.status).toBe("failed");
		expect(res.report.steps[0].error).toContain("appareil");
	});

	it("env sans app → rapport d'échec mappé", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({ app: undefined }),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		expect(res.report.steps[0].error).toContain("application");
	});

	it("source firebase → rapport d'échec mappé (Phase 4)", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({ app: { appId: "com.ouigo.app", source: "firebase" } }),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		expect((res.report.steps[0].error ?? "").toLowerCase()).toContain(
			"firebase",
		);
	});
});
