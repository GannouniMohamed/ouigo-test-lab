import { stepActiveInMode } from "../../shared/types";
import type { RecordedStep, ReportStep, RunMode } from "../../shared/types";

// Build the report's step list from the recorded scenario as the backbone, so a
// failed/partial run still shows the COMPLETE recorded flow with the block
// point located, instead of an empty list.
//
// Only steps ACTIVE in the run mode actually execute (the compiler comments out
// the rest), so executed results are consumed in order against the active
// steps. A step inactive in the mode is surfaced as "ignored for this mode"
// (status skipped, carrying its scope); an active step the run never reached is
// "not reached" (status skipped, scope both).
export function alignStepsToRecorded(
	recorded: RecordedStep[],
	executed: ReportStep[],
	mode: RunMode,
): ReportStep[] {
	if (recorded.length === 0) {
		return executed.map((s, index) => ({ ...s, index }));
	}

	const result: ReportStep[] = [];
	let ptr = 0; // pointer into executed (active steps only)

	for (let i = 0; i < recorded.length; i++) {
		const r = recorded[i];
		const active = stepActiveInMode(r.scope, mode);

		if (!active) {
			// Neutralised for this mode — did not run.
			const step: ReportStep = {
				index: i,
				title: r.title,
				status: "skipped",
				durationMs: 0,
			};
			if (r.scope) step.scope = r.scope;
			result.push(step);
			continue;
		}

		const exec = executed[ptr];
		if (exec) {
			ptr++;
			const step: ReportStep = {
				index: i,
				title: r.title,
				status: exec.status,
				durationMs: exec.durationMs,
			};
			if (exec.error !== undefined) step.error = exec.error;
			if (exec.screenshotPath !== undefined)
				step.screenshotPath = exec.screenshotPath;
			result.push(step);
		} else {
			// Active but the run stopped before reaching it.
			result.push({
				index: i,
				title: r.title,
				status: "skipped",
				durationMs: 0,
			});
		}
	}

	// Surplus executed steps (parser under-counted) — append verbatim.
	for (let i = ptr; i < executed.length; i++) {
		result.push({ ...executed[i], index: result.length });
	}

	return result;
}
