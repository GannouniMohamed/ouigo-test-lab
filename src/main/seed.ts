import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_TUNNEL_COLOR } from "../shared/groups";
import type { Environment, Scenario } from "../shared/types";
import {
	defaultEnvironments,
	getProject,
	listProjects,
	saveEnvironment,
	saveProject,
} from "./stores/projectStore";
import { saveScenario } from "./stores/scenarioStore";
import { saveTunnel } from "./stores/tunnelStore";
import { ensureWorkspace } from "./workspace";

const DEFAULT_PROJECT_ID = "default";
const GENERAL_TUNNEL_ID = "general";

function localEnvironment(fixturesRoot: string): Environment {
	const siteIndexPath = join(fixturesRoot, "site", "index.html");
	return {
		id: "local",
		label: "Local",
		baseURL: pathToFileURL(siteIndexPath).href,
		variables: {},
	};
}

function seedScenariosInto(fixturesRoot: string): void {
	const seedScenariosDir = join(fixturesRoot, "seed-scenarios");
	if (!existsSync(seedScenariosDir)) return;
	for (const entry of readdirSync(seedScenariosDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const src = join(seedScenariosDir, entry.name);
		const metaFile = join(src, "scenario.meta.json");
		if (!existsSync(metaFile)) continue;
		const meta = JSON.parse(readFileSync(metaFile, "utf-8")) as Scenario;
		const specContent = readFileSync(join(src, meta.specFile), "utf-8");
		saveScenario(
			{
				...meta,
				projectId: DEFAULT_PROJECT_ID,
				tunnelId: GENERAL_TUNNEL_ID,
			},
			specContent,
		);
	}
}

export function seedIfEmpty(appRoot: string): void {
	ensureWorkspace();

	const fixturesRoot = process.env.OTL_FIXTURES ?? join(appRoot, "fixtures");
	const local = localEnvironment(fixturesRoot);

	if (listProjects().length === 0) {
		saveProject({
			id: DEFAULT_PROJECT_ID,
			name: "Projet par défaut",
			description: "",
			environments: [...defaultEnvironments(), local],
			createdAt: new Date().toISOString(),
		});
		saveTunnel({
			id: GENERAL_TUNNEL_ID,
			projectId: DEFAULT_PROJECT_ID,
			name: "Général",
			color: DEFAULT_TUNNEL_COLOR,
			description: "",
			order: 0,
			createdAt: new Date().toISOString(),
		});
		seedScenariosInto(fixturesRoot);
		return;
	}

	// Projects already exist (fresh seed done, or migrated): ensure 'local' env
	// on the default project — but only if it still exists (it may have been deleted).
	if (!listProjects().some((p) => p.id === DEFAULT_PROJECT_ID)) return;
	const project = getProject(DEFAULT_PROJECT_ID);
	if (!project.environments.some((e) => e.id === "local")) {
		saveEnvironment(DEFAULT_PROJECT_ID, local);
	}
}
