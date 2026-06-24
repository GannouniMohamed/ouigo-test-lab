import { describe, expect, it } from "vitest";
import { formatGroupStats } from "../../src/renderer/lib/groupStats";
import type { Scenario } from "../../src/shared/types";

function sc(status: "passed" | "failed" | "never"): Scenario {
	return {
		id: `s-${Math.random()}`,
		projectId: "p1",
		tunnelId: "t1",
		name: "S",
		platform: "web",
		browser: "chromium",
		defaultEnvironmentId: "preprod",
		tags: [],
		specFile: "s.spec.ts",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastRun: { status },
	};
}

describe("formatGroupStats", () => {
	it("vide → chaîne vide", () => {
		expect(formatGroupStats([])).toBe("");
	});
	it("singulier/pluriel + segments non nuls", () => {
		expect(
			formatGroupStats([
				sc("passed"),
				sc("passed"),
				sc("passed"),
				sc("failed"),
			]),
		).toBe("3 réussis · 1 échec");
	});
	it("jamais exécutés", () => {
		expect(formatGroupStats([sc("never"), sc("never")])).toBe(
			"2 jamais exécutés",
		);
	});
	it("mixte complet", () => {
		expect(formatGroupStats([sc("passed"), sc("failed"), sc("never")])).toBe(
			"1 réussi · 1 échec · 1 jamais exécuté",
		);
	});
});
