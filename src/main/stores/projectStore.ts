import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Environment, Project } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

export function defaultEnvironments(): Environment[] {
	return [
		{
			id: "preprod",
			label: "Préprod",
			baseURL: "https://preprod.ouigo.example",
			variables: {},
		},
		{
			id: "recette",
			label: "Recette",
			baseURL: "https://recette.ouigo.example",
			variables: {},
		},
	];
}

function projectsDir(): string {
	return join(getWorkspaceDir(), "projects");
}

function projectDir(id: string): string {
	return join(projectsDir(), id);
}

function metaPath(id: string): string {
	return join(projectDir(id), "project.json");
}

function ensureProjectsDir(): void {
	mkdirSync(projectsDir(), { recursive: true });
}

export function listProjects(): Project[] {
	ensureProjectsDir();
	const base = projectsDir();
	const results: Project[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "project.json");
		if (!existsSync(meta)) continue;
		results.push(JSON.parse(readFileSync(meta, "utf-8")) as Project);
	}
	return results;
}

export function getProject(id: string): Project {
	const meta = metaPath(id);
	if (!existsSync(meta)) throw new Error(`Project not found: ${id}`);
	return JSON.parse(readFileSync(meta, "utf-8")) as Project;
}

export function saveProject(p: Project): void {
	mkdirSync(projectDir(p.id), { recursive: true });
	writeFileSync(metaPath(p.id), JSON.stringify(p, null, 2), "utf-8");
}

export function deleteProject(id: string): void {
	if (!existsSync(metaPath(id))) {
		throw new Error(`Project not found: ${id}`);
	}
	if (listProjects().length <= 1) {
		throw new Error("Cannot delete the last project");
	}
	rmSync(projectDir(id), { recursive: true, force: true });
}

export function listEnvironments(projectId: string): Environment[] {
	return getProject(projectId).environments;
}

export function getEnvironment(projectId: string, envId: string): Environment {
	const found = getProject(projectId).environments.find((e) => e.id === envId);
	if (!found) {
		throw new Error(`Environment not found: ${envId} in project ${projectId}`);
	}
	return found;
}

export function saveEnvironment(projectId: string, env: Environment): void {
	const project = getProject(projectId);
	const idx = project.environments.findIndex((e) => e.id === env.id);
	if (idx !== -1) project.environments[idx] = env;
	else project.environments.push(env);
	saveProject(project);
}

export function deleteEnvironment(projectId: string, envId: string): void {
	const project = getProject(projectId);
	if (project.environments.length <= 1) {
		throw new Error("Cannot delete the last environment");
	}
	project.environments = project.environments.filter((e) => e.id !== envId);
	saveProject(project);
}
