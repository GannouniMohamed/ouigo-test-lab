import type { Report, ReportStep, StepStatus } from "../../shared/types";

export interface MaestroMapCtx {
	runId: string;
	scenarioId: string;
	scenarioName: string;
	projectId?: string;
	tunnelId?: string;
	environmentId?: string;
	environmentLabel: string;
	startedAt: string;
	durationMs: number;
	planTitles: string[];
}

// Statut global faisant foi : lu depuis le XML JUnit produit par
// `maestro test --format junit`. Un XML illisible est traité comme un échec
// (on ne déclare jamais un run vert par défaut).
export function parseJUnitStatus(xml: string): {
	failed: boolean;
	message?: string;
} {
	if (!xml || !/<testsuite/i.test(xml)) return { failed: true };
	const failuresAttr = /failures="(\d+)"/i.exec(xml);
	const errorsAttr = /errors="(\d+)"/i.exec(xml);
	const hasFailureTag = /<(failure|error)\b/i.test(xml);
	const failed =
		(failuresAttr ? Number(failuresAttr[1]) > 0 : false) ||
		(errorsAttr ? Number(errorsAttr[1]) > 0 : false) ||
		hasFailureTag;
	const msg = /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/i.exec(
		xml,
	);
	const inlineMsg = /<(?:failure|error)\b[^>]*\bmessage="([^"]*)"/i.exec(xml);
	const message = (msg?.[1] || inlineMsg?.[1] || "").trim() || undefined;
	return message ? { failed, message } : { failed };
}

// Granularité par étape (best-effort) : on lit les glyphes ✅/❌ du stdout
// Maestro, dans l'ordre. Pas de protocole stable → on reste tolérant.
export function parseMaestroSteps(stdout: string): StepStatus[] {
	const out: StepStatus[] = [];
	for (const line of stdout.split("\n")) {
		if (/✅|\[Passed\]|\bPASSED\b/.test(line)) out.push("passed");
		else if (/❌|\[Failed\]|\bFAILED\b/.test(line)) out.push("failed");
	}
	return out;
}

// Construit le Report : ossature = plan du flow (planTitles) ; statut par étape
// depuis le stdout, recoupé avec le statut global JUnit. Une étape après l'échec
// est "skipped" (non atteinte).
export function buildMaestroReport(
	ctx: MaestroMapCtx,
	stdout: string,
	junitXml: string,
): Report {
	const junit = parseJUnitStatus(junitXml);
	const stepStatuses = parseMaestroSteps(stdout);
	const failedIndex = stepStatuses.indexOf("failed");

	const steps: ReportStep[] = ctx.planTitles.map((title, i) => {
		let status: StepStatus;
		if (failedIndex >= 0 && i > failedIndex) status = "skipped";
		else if (i < stepStatuses.length) status = stepStatuses[i];
		else status = junit.failed ? "skipped" : "passed";
		const step: ReportStep = { index: i, title, status, durationMs: 0 };
		if (status === "failed" && junit.message) step.error = junit.message;
		return step;
	});

	const anyFailed = steps.some((s) => s.status === "failed");
	const status = junit.failed || anyFailed ? "failed" : "passed";

	return {
		runId: ctx.runId,
		scenarioId: ctx.scenarioId,
		scenarioName: ctx.scenarioName,
		projectId: ctx.projectId,
		tunnelId: ctx.tunnelId,
		environmentId: ctx.environmentId,
		environmentLabel: ctx.environmentLabel,
		status,
		durationMs: ctx.durationMs,
		startedAt: ctx.startedAt,
		steps,
	};
}
