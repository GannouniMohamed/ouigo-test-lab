import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/projectStore";
import type { MobileApp, Project } from "../../src/shared/types";

// Le store lit le workspace via la variable d'env OTL_WORKSPACE (voir
// src/main/workspace.ts). On l'isole dans un dossier temporaire par test, comme
// tests/main/projectStore.test.ts.
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-mobile-"));
	process.env.OTL_WORKSPACE = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("modèle app mobile", () => {
	it("un Environment.app (source firebase) survit à saveProject/getProject", () => {
		const app: MobileApp = {
			appId: "com.ouigo.app",
			source: "firebase",
			firebase: {
				projectNumber: "1234567890",
				firebaseAppId: "1:1234567890:android:abc123",
				serviceAccountKeyPath: "/keys/sa.json",
			},
		};
		const project: Project = {
			id: "p1",
			name: "OUIGO Mobile",
			description: "",
			createdAt: new Date().toISOString(),
			environments: [
				{ id: "preprod", label: "Préprod", baseURL: "", variables: {}, app },
			],
		};
		store.saveProject(project);
		const loaded = store.getProject("p1");
		expect(loaded.environments[0].app).toEqual(app);
	});

	it("un Environment.app (source installed, sans firebase) survit au round-trip", () => {
		const app: MobileApp = { appId: "com.ouigo.app", source: "installed" };
		const project: Project = {
			id: "p2",
			name: "OUIGO Mobile",
			description: "",
			createdAt: new Date().toISOString(),
			environments: [
				{ id: "preprod", label: "Préprod", baseURL: "", variables: {}, app },
			],
		};
		store.saveProject(project);
		const loaded = store.getProject("p2");
		expect(loaded.environments[0].app).toEqual(app);
		expect(loaded.environments[0].app?.firebase).toBeUndefined();
	});
});
