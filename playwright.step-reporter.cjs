const fs = require("node:fs");

// Custom Playwright reporter: captures user-meaningful steps (page.* / locator.* /
// expect.*) that the built-in JSON reporter omits from result.steps, and writes
// them to OTL_STEPS_OUT so the runner can surface real steps for recorded specs.
//
// The captured list maps one-to-one, in order, onto the recorded actions, so the
// runner can align run outcomes back to the recorded spec. Two rules protect that
// alignment:
//   1. Skip Playwright's automatic failure screenshot (`page.screenshot`), which
//      is teardown, not a user action.
//   2. Stop collecting after the first failed step — a recorded test halts at its
//      first failure, so anything after it is teardown and would shift alignment.
class StepReporter {
	constructor() {
		this._steps = [];
		this._stopped = false;
	}
	onStepEnd(_test, _result, step) {
		if (this._stopped) return;
		const cat = step.category;
		const title = String(step.title);
		const keep =
			cat === "expect" ||
			(cat === "pw:api" &&
				!title.startsWith("browser") &&
				!title.startsWith("page.screenshot"));
		if (!keep) return;
		const failed = Boolean(step.error);
		this._steps.push({
			title: step.title,
			durationMs: typeof step.duration === "number" ? step.duration : 0,
			status: failed ? "failed" : "passed",
			error: failed
				? step.error && (step.error.message || step.error.stack)
					? step.error.message || step.error.stack
					: "Échec de l'étape"
				: undefined,
		});
		// First failure ends the meaningful step sequence.
		if (failed) this._stopped = true;
	}
	onEnd() {
		const out = process.env.OTL_STEPS_OUT;
		if (!out) return;
		try {
			fs.writeFileSync(out, JSON.stringify(this._steps), "utf-8");
		} catch {
			/* ignore — runner falls back to the JSON report */
		}
	}
}

module.exports = StepReporter;
