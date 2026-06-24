import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TUNNEL_COLOR } from "../shared/groups";
import type { Environment, Platform, Scenario } from "../shared/types";
import {
	defaultEnvironments,
	listProjects,
	saveProject,
} from "./stores/projectStore";
import { saveScenario } from "./stores/scenarioStore";
import { saveTunnel } from "./stores/tunnelStore";
import { getWorkspaceDir } from "./workspace";

const DEFAULT_PROJECT_ID = "default";
const GENERAL_TUNNEL_ID = "general";

function normalizePlatform(value: unknown): Platform {
	return value === "responsive" || value === "mobile" || value === "web"
		? value
		: "web";
}

function readLegacyEnvironments(workspace: string): Environment[] {
	const file = join(workspace, "environments.json");
	if (!existsSync(file)) return defaultEnvironments();
	const data = JSON.parse(readFileSync(file, "utf-8")) as {
		environments: Environment[];
	};
	return data.environments.length > 0
		? data.environments
		: defaultEnvironments();
}

export function migrateWorkspaceIfNeeded(): void {
	const workspace = getWorkspaceDir();
	const legacyScenariosDir = join(workspace, "scenarios");
	const legacyEnvFile = join(workspace, "environments.json");

	const hasLegacy = existsSync(legacyScenariosDir) || existsSync(legacyEnvFile);
	// Idempotent: once any project exists, migration has already run.
	if (!hasLegacy || listProjects().length > 0) return;

	const now = new Date().toISOString();

	saveProject({
		id: DEFAULT_PROJECT_ID,
		name: "Projet par défaut",
		description: "",
		environments: readLegacyEnvironments(workspace),
		createdAt: now,
	});
	saveTunnel({
		id: GENERAL_TUNNEL_ID,
		projectId: DEFAULT_PROJECT_ID,
		name: "Général",
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
		order: 0,
		createdAt: now,
	});

	if (existsSync(legacyScenariosDir)) {
		for (const entry of readdirSync(legacyScenariosDir, {
			withFileTypes: true,
		})) {
			if (!entry.isDirectory()) continue;
			const metaFile = join(
				legacyScenariosDir,
				entry.name,
				"scenario.meta.json",
			);
			if (!existsSync(metaFile)) continue;
			const old = JSON.parse(readFileSync(metaFile, "utf-8")) as Scenario;
			const specPath = join(legacyScenariosDir, entry.name, old.specFile);
			const specContent = existsSync(specPath)
				? readFileSync(specPath, "utf-8")
				: "";
			const migrated: Scenario = {
				...old,
				projectId: DEFAULT_PROJECT_ID,
				tunnelId: GENERAL_TUNNEL_ID,
				platform: normalizePlatform(old.platform),
			};
			saveScenario(migrated, specContent);
		}
	}

	rmSync(legacyScenariosDir, { recursive: true, force: true });
	rmSync(legacyEnvFile, { force: true });
}
