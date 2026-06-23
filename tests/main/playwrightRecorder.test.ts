import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRecorder } from "../../src/main/recorder/playwrightRecorder";
import { slugify } from "../../src/main/recorder/slugify";
import { saveEnvironment } from "../../src/main/stores/environmentStore";
import {
	getScenario,
	listScenarios,
} from "../../src/main/stores/scenarioStore";

const REPO = resolve(__dirname, "../..");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-rec-"));
	process.env.OTL_WORKSPACE = dir;
	// point the recorder at the fake codegen instead of real `npx playwright codegen`
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

describe("slugify", () => {
	it("normalise le nom", () => {
		expect(slugify("Parcours de Connexion ")).toBe("parcours-de-connexion");
		expect(slugify("Achat billet Paris → Lyon")).toBe(
			"achat-billet-paris-lyon",
		);
		expect(slugify("")).toBe("scenario");
	});
});

describe("playwrightRecorder", () => {
	it("enregistre puis crée un scénario exécutable", async () => {
		const { recordingId } = await playwrightRecorder.startRecording({
			name: "Parcours enregistré",
			browser: "chromium",
			environmentId: "local",
		});
		expect(recordingId).toBeTruthy();
		// let the fake codegen write the file
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await playwrightRecorder.stopRecording(recordingId);
		expect(scenario.name).toBe("Parcours enregistré");
		expect(scenario.platform).toBe("web");
		expect(listScenarios()).toHaveLength(1);
		// the generated spec was persisted
		expect(getScenario(scenario.id).specFile).toMatch(/\.spec\.ts$/);
	}, 15000);
});
