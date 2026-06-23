import { describe, expect, it } from "vitest";
import { mapPlaywrightReport } from "../../src/main/runner/reportMapper";
import raw from "../fixtures/playwright-report.json";

describe("mapPlaywrightReport", () => {
	const ctx = {
		runId: "r1",
		scenarioId: "login",
		scenarioName: "Connexion",
		environmentLabel: "Préprod",
		startedAt: "2026-06-23T14:31:00Z",
	};

	it("statut global = failed", () => {
		expect(mapPlaywrightReport(raw, ctx).status).toBe("failed");
	});
	it("durée = somme des résultats", () => {
		expect(mapPlaywrightReport(raw, ctx).durationMs).toBe(4200);
	});
	it("mappe les étapes avec index séquentiel", () => {
		const steps = mapPlaywrightReport(raw, ctx).steps;
		expect(steps).toHaveLength(2);
		expect(steps[0]).toMatchObject({
			index: 0,
			title: "Ouvrir la page d'accueil",
			status: "passed",
			durationMs: 1200,
		});
		expect(steps[1]).toMatchObject({
			index: 1,
			title: "Cliquer sur Connexion",
			status: "failed",
			durationMs: 3000,
			error: "locator not found",
		});
	});
	it("la capture est attachée à l'étape en échec", () => {
		const failed = mapPlaywrightReport(raw, ctx).steps.find(
			(s) => s.status === "failed",
		);
		expect(failed?.screenshotPath).toBe(
			"/tmp/test-results/login/test-failed-1.png",
		);
	});
	it("recopie le contexte", () => {
		const r = mapPlaywrightReport(raw, ctx);
		expect(r.runId).toBe("r1");
		expect(r.environmentLabel).toBe("Préprod");
		expect(r.startedAt).toBe("2026-06-23T14:31:00Z");
	});
});
