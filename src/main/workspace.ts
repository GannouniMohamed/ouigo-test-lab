import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export function getWorkspaceDir(): string {
	if (process.env.OTL_WORKSPACE) return process.env.OTL_WORKSPACE;
	// lazy require keeps electron out of unit tests that always set OTL_WORKSPACE
	const require = createRequire(import.meta.url);
	const { app } = require("electron") as typeof import("electron");
	return join(app.getPath("userData"), "OuigoTestLab");
}

export function ensureWorkspace(): void {
	const root = getWorkspaceDir();
	for (const sub of ["scenarios", "runs"])
		mkdirSync(join(root, sub), { recursive: true });
}
