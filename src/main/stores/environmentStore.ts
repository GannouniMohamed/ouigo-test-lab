import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Environment } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

const DEFAULTS: Environment[] = [
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

function filePath(): string {
	return join(getWorkspaceDir(), "environments.json");
}

function readEnvironments(): Environment[] {
	const p = filePath();
	if (!existsSync(p)) return [...DEFAULTS];
	const data = JSON.parse(readFileSync(p, "utf-8")) as {
		environments: Environment[];
	};
	return data.environments;
}

function writeEnvironments(environments: Environment[]): void {
	writeFileSync(filePath(), JSON.stringify({ environments }, null, 2), "utf-8");
}

export function listEnvironments(): Environment[] {
	return readEnvironments();
}

export function getEnvironment(id: string): Environment {
	const found = listEnvironments().find((e) => e.id === id);
	if (!found) throw new Error(`Environment not found: ${id}`);
	return found;
}

export function saveEnvironment(e: Environment): void {
	const current = readEnvironments();
	const idx = current.findIndex((ex) => ex.id === e.id);
	if (idx !== -1) {
		current[idx] = e;
	} else {
		current.push(e);
	}
	writeEnvironments(current);
}
