import type { Scenario } from "../../shared/types";

export function formatGroupStats(items: Scenario[]): string {
	let passed = 0;
	let failed = 0;
	let never = 0;
	for (const s of items) {
		if (s.lastRun.status === "passed") passed++;
		else if (s.lastRun.status === "failed") failed++;
		else never++;
	}
	const segs: string[] = [];
	if (passed > 0) segs.push(`${passed} ${passed > 1 ? "réussis" : "réussi"}`);
	if (failed > 0) segs.push(`${failed} ${failed > 1 ? "échecs" : "échec"}`);
	if (never > 0)
		segs.push(`${never} ${never > 1 ? "jamais exécutés" : "jamais exécuté"}`);
	return segs.join(" · ");
}
