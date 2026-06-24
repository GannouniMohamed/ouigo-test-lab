import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import type { Tunnel } from "../../shared/types";
import { getWorkspaceDir } from "../workspace";

function normalize(raw: Tunnel): Tunnel {
	return {
		...raw,
		color: raw.color ?? DEFAULT_TUNNEL_COLOR,
		description: raw.description ?? "",
	};
}

function tunnelsDir(projectId: string): string {
	return join(getWorkspaceDir(), "projects", projectId, "tunnels");
}

function tunnelDir(projectId: string, tunnelId: string): string {
	return join(tunnelsDir(projectId), tunnelId);
}

function metaPath(projectId: string, tunnelId: string): string {
	return join(tunnelDir(projectId, tunnelId), "tunnel.json");
}

export function listTunnels(projectId: string): Tunnel[] {
	const base = tunnelsDir(projectId);
	mkdirSync(base, { recursive: true });
	const results: Tunnel[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const meta = join(base, entry.name, "tunnel.json");
		if (!existsSync(meta)) continue;
		results.push(normalize(JSON.parse(readFileSync(meta, "utf-8")) as Tunnel));
	}
	return results.sort((a, b) => a.order - b.order);
}

export function getTunnel(projectId: string, tunnelId: string): Tunnel {
	const meta = metaPath(projectId, tunnelId);
	if (!existsSync(meta)) {
		throw new Error(`Tunnel not found: ${tunnelId} in project ${projectId}`);
	}
	return normalize(JSON.parse(readFileSync(meta, "utf-8")) as Tunnel);
}

export function saveTunnel(t: Tunnel): void {
	mkdirSync(tunnelDir(t.projectId, t.id), { recursive: true });
	writeFileSync(
		metaPath(t.projectId, t.id),
		JSON.stringify(t, null, 2),
		"utf-8",
	);
}

function tunnelHasScenarios(projectId: string, tunnelId: string): boolean {
	const scenariosDir = join(tunnelDir(projectId, tunnelId), "scenarios");
	if (!existsSync(scenariosDir)) return false;
	return readdirSync(scenariosDir, { withFileTypes: true }).some(
		(e) =>
			e.isDirectory() &&
			existsSync(join(scenariosDir, e.name, "scenario.meta.json")),
	);
}

export function deleteTunnel(projectId: string, tunnelId: string): void {
	if (listTunnels(projectId).length <= 1) {
		throw new Error("Cannot delete the last tunnel of a project");
	}
	if (tunnelHasScenarios(projectId, tunnelId)) {
		throw new Error("Cannot delete a tunnel that still contains scenarios");
	}
	const dir = tunnelDir(projectId, tunnelId);
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
