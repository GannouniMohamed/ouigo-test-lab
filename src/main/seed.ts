import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Scenario } from "../shared/types";
import {
	getEnvironment,
	listEnvironments,
	saveEnvironment,
} from "./stores/environmentStore";
import { listScenarios, saveScenario } from "./stores/scenarioStore";
import { ensureWorkspace, getWorkspaceDir } from "./workspace";

export function seedIfEmpty(appRoot: string): void {
	ensureWorkspace();

	const scenarios = listScenarios();
	if (scenarios.length === 0) {
		const seedScenariosDir = join(appRoot, "fixtures", "seed-scenarios");
		if (existsSync(seedScenariosDir)) {
			const workspaceScenariosDir = join(getWorkspaceDir(), "scenarios");
			for (const entry of readdirSync(seedScenariosDir, {
				withFileTypes: true,
			})) {
				if (!entry.isDirectory()) continue;
				const src = join(seedScenariosDir, entry.name);
				const dest = join(workspaceScenariosDir, entry.name);
				cpSync(src, dest, { recursive: true });
			}
		}
	}

	// Ensure a 'local' environment exists
	const envs = listEnvironments();
	const hasLocal = envs.some((e) => e.id === "local");
	if (!hasLocal) {
		const siteIndexPath = join(appRoot, "fixtures", "site", "index.html");
		const baseURL = pathToFileURL(siteIndexPath).href;
		saveEnvironment({
			id: "local",
			label: "Local",
			baseURL,
			variables: {},
		});
	}
}
