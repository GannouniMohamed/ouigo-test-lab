import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleStartRecording,
	handleStopRecording,
} from "../../src/main/ipc/recordingHandlers";
import * as projectStore from "../../src/main/stores/projectStore";
import { saveTunnel } from "../../src/main/stores/tunnelStore";
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";
import type { Project } from "../../src/shared/types";

const REPO = resolve(__dirname, "../..");
let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-rdisp-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_SKIP_STUDIO_LAUNCH = "1";
	// pointe le recorder web vers le faux codegen (pas de vrai navigateur)
	process.env.OTL_CODEGEN = "node";
	process.env.OTL_CODEGEN_ARGS = resolve(
		REPO,
		"tests/fixtures/fake-codegen.mjs",
	);
	const project: Project = {
		id: "p1",
		name: "P",
		description: "",
		createdAt: "2026-06-26T00:00:00Z",
		environments: [
			{
				id: "preprod",
				label: "Préprod",
				baseURL: "https://x.example",
				variables: {},
				app: { appId: "com.ouigo.app", source: "installed" },
			},
		],
	};
	projectStore.saveProject(project);
	saveTunnel({
		id: "general",
		projectId: "p1",
		name: "Général",
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
		order: 0,
		createdAt: "2026-06-26T00:00:00Z",
	});
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of [
		"OTL_WORKSPACE",
		"OTL_SKIP_STUDIO_LAUNCH",
		"OTL_CODEGEN",
		"OTL_CODEGEN_ARGS",
	])
		Reflect.deleteProperty(process.env, k);
});

describe("dispatch d'enregistrement par plateforme", () => {
	it("platform mobile → maestroRecorder (crée un scénario mobile)", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Parcours",
			browser: "chromium",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
			platform: "mobile",
			deviceId: "emulator-5554",
		});
		const folder = join(dir, "recordings", recordingId);
		writeFileSync(join(folder, "rec.yaml"), "appId: x\n---\n- launchApp\n");
		const scenario = await handleStopRecording(recordingId);
		expect(scenario.platform).toBe("mobile");
		expect(scenario.specFile.endsWith(".flow.yaml")).toBe(true);
	});

	it("platform absente → playwrightRecorder (crée un scénario web), start+stop routés via la Map", async () => {
		const { recordingId } = await handleStartRecording({
			name: "Parcours web",
			browser: "chromium",
			environmentId: "preprod",
			projectId: "p1",
			tunnelId: "general",
		});
		// laisse le faux codegen écrire sa sortie
		await new Promise((r) => setTimeout(r, 300));
		const scenario = await handleStopRecording(recordingId);
		expect(scenario.platform).toBe("web");
		expect(scenario.specFile.endsWith(".spec.ts")).toBe(true);
	}, 15000);
});
