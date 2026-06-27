import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maestroRunner } from "../../src/main/runner/maestroRunner";
import { getReport } from "../../src/main/stores/reportStore";
import { getScenario, saveScenario } from "../../src/main/stores/scenarioStore";
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
		"OTL_FAKE_MAESTRO_SLEEP",
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

		// #21/#26 step-level events : step-started puis step-passed entre run-started et run-finished
		const types = events.map((e) => e.type);
		const startedIdx = types.indexOf("run-started");
		const finishedIdx = types.lastIndexOf("run-finished");
		const middleTypes = types.slice(startedIdx + 1, finishedIdx);
		expect(middleTypes).toContain("step-started");
		expect(middleTypes).toContain("step-passed");
		// step-started doit précéder step-passed
		expect(middleTypes.indexOf("step-started")).toBeLessThan(
			middleTypes.lastIndexOf("step-passed"),
		);
		// aucun step-failed dans un run passant
		expect(middleTypes).not.toContain("step-failed");
	});

	it("#21/#26 run échouant : émet step-failed avec error, étapes suivantes step-skipped", async () => {
		process.env.OTL_FAKE_MAESTRO_FAIL = "1";
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const events: RunEvent[] = [];
		const res = await maestroRunner.run(
			scenario,
			mobileEnv(),
			(e) => events.push(e),
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");

		const types = events.map((e) => e.type);
		expect(types).toContain("step-failed");
		// l'événement step-failed doit avoir un champ error non vide
		const failEvt = events.find((e) => e.type === "step-failed") as Extract<
			RunEvent,
			{ type: "step-failed" }
		>;
		expect(failEvt?.error).toBeTruthy();
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

	it("cancel() tue le run et renvoie le statut cancelled", async () => {
		process.env.OTL_FAKE_MAESTRO_SLEEP = "1";
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		let runId = "";
		const runPromise = maestroRunner.run(
			scenario,
			mobileEnv(),
			(e) => {
				if (e.type === "run-started") runId = e.runId;
			},
			{ deviceId: "emulator-5554" },
		);
		await new Promise((r) => setTimeout(r, 150));
		expect(runId).toBeTruthy();
		await maestroRunner.cancel(runId);
		const res = await runPromise;
		expect(res.status).toBe("cancelled");
	});

	it("cancel() d'un runId inconnu est un no-op (pas d'exception)", async () => {
		await expect(maestroRunner.cancel("inconnu")).resolves.toBeUndefined();
	});

	it("maestro introuvable → rapport d'échec (pas d'exception)", async () => {
		process.env.OTL_MAESTRO_BIN = "otl-maestro-inexistant-xyz";
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN_ARGS");
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {}, {
			deviceId: "emulator-5554",
		});
		expect(res.status).toBe("failed");
	});

	it("source firebase sans creds valides → rapport d'échec mappé (Firebase)", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(
			scenario,
			mobileEnv({
				app: {
					appId: "com.ouigo.app",
					source: "firebase",
					firebase: {
						projectNumber: "123",
						firebaseAppId: "1:123:android:abc",
						serviceAccountKeyPath: "/chemin/inexistant/sa.json",
					},
				},
			}),
			() => {},
			{ deviceId: "emulator-5554" },
		);
		expect(res.status).toBe("failed");
		const err = res.report.steps[0].error ?? "";
		expect(err.toLowerCase()).toContain("firebase");
		// passe réellement par ensureAppOnDevice (et non plus par le garde-fou Phase 4)
		expect(err).not.toContain("Phase 4");
	});

	it("#37 ensureManagedMaestro échoue → res.status === 'failed' avec message d'erreur", async () => {
		// Supprime OTL_MAESTRO_BIN pour que ensureManagedMaestro ne court-circuite pas.
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN");
		Reflect.deleteProperty(process.env, "OTL_MAESTRO_BIN_ARGS");
		// Le workspace (dir) est vide → pas de binaire géré présent.
		// On stubbe fetch pour que le téléchargement échoue immédiatement.
		const origFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			throw new Error("Téléchargement impossible (test stub)");
		};
		try {
			const scenario = mobileScenario();
			saveScenario(scenario, FLOW);
			const res = await maestroRunner.run(scenario, mobileEnv(), () => {}, {
				deviceId: "emulator-5554",
			});
			expect(res.status).toBe("failed");
			// Le rapport doit contenir un message d'erreur
			expect(res.report.steps[0].error).toBeTruthy();
		} finally {
			globalThis.fetch = origFetch;
			// Restaure les vars pour les autres tests
			process.env.OTL_MAESTRO_BIN = process.execPath;
			process.env.OTL_MAESTRO_BIN_ARGS = FAKE;
		}
	});

	it("#40 persistance du rapport : getReport et lastRun correspondent au résultat du run", async () => {
		const scenario = mobileScenario();
		saveScenario(scenario, FLOW);
		const res = await maestroRunner.run(scenario, mobileEnv(), () => {}, {
			deviceId: "emulator-5554",
		});

		// Vérifie que le rapport est persisté correctement
		const persisted = getReport(res.runId);
		expect(persisted.runId).toBe(res.runId);
		expect(persisted.status).toBe(res.status);
		expect(persisted.scenarioId).toBe(scenario.id);

		// Vérifie que lastRun du scénario correspond au résultat
		const updatedScenario = getScenario(
			scenario.projectId,
			scenario.tunnelId,
			scenario.id,
		);
		expect(updatedScenario.lastRun.status).toBe(
			res.status === "passed" ? "passed" : "failed",
		);
	});
});
