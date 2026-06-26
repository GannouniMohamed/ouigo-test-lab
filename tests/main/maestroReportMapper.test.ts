import { describe, expect, it } from "vitest";
import {
	type MaestroMapCtx,
	buildMaestroReport,
	parseJUnitStatus,
	parseMaestroSteps,
} from "../../src/main/runner/maestroReportMapper";

const JUNIT_PASS = `<?xml version="1.0"?>
<testsuites><testsuite name="flow" tests="1" failures="0">
<testcase name="my flow"/></testsuite></testsuites>`;

const JUNIT_FAIL = `<?xml version="1.0"?>
<testsuites><testsuite name="flow" tests="1" failures="1">
<testcase name="my flow"><failure>Assertion "Bienvenue" failed</failure></testcase>
</testsuite></testsuites>`;

const STDOUT_PASS = `Running on emulator-5554
  ✅  Launch app "com.ouigo.app"
  ✅  Tap on "Connexion"
  ✅  Assert visible "Bienvenue"
`;

const STDOUT_FAIL = `Running on emulator-5554
  ✅  Launch app "com.ouigo.app"
  ✅  Tap on "Connexion"
  ❌  Assert visible "Bienvenue"
`;

function ctx(over: Partial<MaestroMapCtx> = {}): MaestroMapCtx {
	return {
		runId: "r1",
		scenarioId: "s1",
		scenarioName: "Mon parcours",
		environmentLabel: "Préprod",
		startedAt: "2026-06-26T10:00:00Z",
		durationMs: 4200,
		planTitles: [
			"launchApp:",
			'tapOn: "Connexion"',
			'assertVisible: "Bienvenue"',
		],
		...over,
	};
}

describe("parseJUnitStatus", () => {
	it("détecte un succès", () => {
		expect(parseJUnitStatus(JUNIT_PASS)).toEqual({ failed: false });
	});
	it("détecte un échec et extrait le message", () => {
		const r = parseJUnitStatus(JUNIT_FAIL);
		expect(r.failed).toBe(true);
		expect(r.message).toContain("Bienvenue");
	});
	it("XML illisible → considéré échoué (sécurité)", () => {
		expect(parseJUnitStatus("pas du xml").failed).toBe(true);
	});
});

describe("parseMaestroSteps", () => {
	it("lit les glyphes ✅/❌ dans l'ordre", () => {
		expect(parseMaestroSteps(STDOUT_FAIL)).toEqual([
			"passed",
			"passed",
			"failed",
		]);
	});
	it("renvoie [] si aucun glyphe", () => {
		expect(parseMaestroSteps("aucun marqueur ici")).toEqual([]);
	});
});

describe("buildMaestroReport", () => {
	it("run passant : toutes les étapes passed, statut passed", () => {
		const report = buildMaestroReport(ctx(), STDOUT_PASS, JUNIT_PASS);
		expect(report.status).toBe("passed");
		expect(report.steps).toHaveLength(3);
		expect(report.steps.every((s) => s.status === "passed")).toBe(true);
		expect(report.steps.map((s) => s.title)).toEqual(ctx().planTitles);
		expect(report.durationMs).toBe(4200);
	});

	it("run échouant : étape en échec marquée, suivantes 'skipped', message porté", () => {
		const report = buildMaestroReport(ctx(), STDOUT_FAIL, JUNIT_FAIL);
		expect(report.status).toBe("failed");
		expect(report.steps[0].status).toBe("passed");
		expect(report.steps[1].status).toBe("passed");
		expect(report.steps[2].status).toBe("failed");
		expect(report.steps[2].error).toContain("Bienvenue");
	});

	it("échec sur étape médiane → étapes suivantes 'skipped' (non atteintes)", () => {
		const report = buildMaestroReport(
			ctx(),
			"  ✅  Launch\n  ❌  Tap\n",
			JUNIT_FAIL,
		);
		expect(report.steps[0].status).toBe("passed");
		expect(report.steps[1].status).toBe("failed");
		expect(report.steps[2].status).toBe("skipped");
	});

	it("JUnit échec mais stdout vide → statut failed, étapes 'skipped'", () => {
		const report = buildMaestroReport(ctx(), "", JUNIT_FAIL);
		expect(report.status).toBe("failed");
		expect(report.steps.every((s) => s.status === "skipped")).toBe(true);
	});
});
