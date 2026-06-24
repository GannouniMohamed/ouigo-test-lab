import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureWorkspace, getWorkspaceDir } from "../../src/main/workspace";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

describe("workspace", () => {
	it("utilise OTL_WORKSPACE quand défini", () => {
		expect(getWorkspaceDir()).toBe(dir);
	});
	it("crée les sous-dossiers projects/ runs/", () => {
		ensureWorkspace();
		expect(existsSync(join(dir, "projects"))).toBe(true);
		expect(existsSync(join(dir, "runs"))).toBe(true);
	});
});
