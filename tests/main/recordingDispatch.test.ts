import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	handleStartRecording,
	handleStopRecording,
} from "../../src/main/ipc/recordingHandlers";
import * as projectStore from "../../src/main/stores/projectStore";
import type { Project } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-rdisp-"));
	process.env.OTL_WORKSPACE = dir;
	process.env.OTL_SKIP_STUDIO_LAUNCH = "1";
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
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	for (const k of ["OTL_WORKSPACE", "OTL_SKIP_STUDIO_LAUNCH"])
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
});
