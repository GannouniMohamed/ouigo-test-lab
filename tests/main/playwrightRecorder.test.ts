import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playwrightRecorder } from "../../src/main/recorder/playwrightRecorder";
import { slugify } from "../../src/main/recorder/slugify";
import { saveProject } from "../../src/main/stores/projectStore";
import {
	getScenario,
	listScenarios,
} from "../../src/main/stores/scenarioStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";

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
		order: 0,
		createdAt: "2026-06-24T00:00:00Z",
	});
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-rec-"));
	process.env.OTL_WORKSPACE = dir;
	// point the recorder at the fake codegen instead of real `npx playwright codegen`
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
			projectId: "default",
			tunnelId: "general",
		});
		expect(recordingId).toBeTruthy();
		// let the fake codegen write the file
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await playwrightRecorder.stopRecording(recordingId);
		expect(scenario.name).toBe("Parcours enregistré");
		expect(scenario.platform).toBe("web");
		expect(listScenarios("default", "general")).toHaveLength(1);
		// the generated spec was persisted
		expect(getScenario("default", "general", scenario.id).specFile).toMatch(
			/\.spec\.ts$/,
		);
	}, 15000);
});
