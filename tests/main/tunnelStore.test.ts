import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "../../src/main/stores/tunnelStore";
import { DEFAULT_TUNNEL_COLOR } from "../../src/shared/groups";
import type { Tunnel } from "../../src/shared/types";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-tun-"));
	process.env.OTL_WORKSPACE = dir;
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	Reflect.deleteProperty(process.env, "OTL_WORKSPACE");
});

function tunnel(id: string, order: number): Tunnel {
	return {
		id,
		projectId: "p1",
		name: `Tunnel ${id}`,
		order,
		color: DEFAULT_TUNNEL_COLOR,
		description: "",
		createdAt: "2026-06-24T00:00:00Z",
	};
}

// Creates a scenario directory under a tunnel to simulate a non-empty tunnel.
function addScenarioDir(tunnelId: string, scenarioId: string): void {
	const sdir = join(
		dir,
		"projects",
		"p1",
		"tunnels",
		tunnelId,
		"scenarios",
		scenarioId,
	);
	mkdirSync(sdir, { recursive: true });
	writeFileSync(join(sdir, "scenario.meta.json"), "{}", "utf-8");
}

describe("tunnelStore", () => {
	it("listTunnels renvoie [] si aucun tunnel", () => {
		expect(store.listTunnels("p1")).toEqual([]);
	});
	it("sauvegarde et liste les tunnels triés par order", () => {
		store.saveTunnel(tunnel("b", 1));
		store.saveTunnel(tunnel("a", 0));
		expect(store.listTunnels("p1").map((t) => t.id)).toEqual(["a", "b"]);
	});
	it("getTunnel renvoie un tunnel", () => {
		store.saveTunnel(tunnel("a", 0));
		expect(store.getTunnel("p1", "a").name).toBe("Tunnel a");
	});
	it("deleteTunnel supprime un tunnel vide non-dernier", () => {
		store.saveTunnel(tunnel("a", 0));
		store.saveTunnel(tunnel("b", 1));
		store.deleteTunnel("p1", "a");
		expect(store.listTunnels("p1").map((t) => t.id)).toEqual(["b"]);
	});
	it("deleteTunnel refuse de supprimer le dernier tunnel", () => {
		store.saveTunnel(tunnel("a", 0));
		expect(() => store.deleteTunnel("p1", "a")).toThrow();
	});
	it("deleteTunnel refuse de supprimer un tunnel non vide", () => {
		store.saveTunnel(tunnel("a", 0));
		store.saveTunnel(tunnel("b", 1));
		addScenarioDir("a", "s1");
		expect(() => store.deleteTunnel("p1", "a")).toThrow();
	});

	it("listTunnels rétro-remplit color/description pour les tunnels legacy", () => {
		// Write a legacy tunnel.json without color/description.
		const tdir = join(dir, "projects", "p1", "tunnels", "t-legacy");
		mkdirSync(tdir, { recursive: true });
		writeFileSync(
			join(tdir, "tunnel.json"),
			JSON.stringify({
				id: "t-legacy",
				projectId: "p1",
				name: "Legacy",
				order: 0,
				createdAt: "2026-01-01T00:00:00.000Z",
			}),
			"utf-8",
		);
		const [t] = store.listTunnels("p1");
		expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
		expect(t.description).toBe("");
	});

	it("getTunnel rétro-remplit color/description", () => {
		const tdir = join(dir, "projects", "p2", "tunnels", "t-legacy2");
		mkdirSync(tdir, { recursive: true });
		writeFileSync(
			join(tdir, "tunnel.json"),
			JSON.stringify({
				id: "t-legacy2",
				projectId: "p2",
				name: "Legacy2",
				order: 0,
				createdAt: "2026-01-01T00:00:00.000Z",
			}),
			"utf-8",
		);
		const t = store.getTunnel("p2", "t-legacy2");
		expect(t.color).toBe(DEFAULT_TUNNEL_COLOR);
		expect(t.description).toBe("");
	});
});
