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
// Whether a step is one of the user-meaningful steps we keep (and stream).
function isKeptStep(step) {
	const cat = step.category;
	const title = String(step.title);
	return (
		cat === "expect" ||
		(cat === "pw:api" &&
			!title.startsWith("browser") &&
			!title.startsWith("page.screenshot"))
	);
}

class StepReporter {
	constructor() {
		this._steps = [];
		this._stopped = false;
	}
	onStepBegin(_test, _result, step) {
		// Stream a "begin" marker on stdout for each kept step so the runner can
		// light up the parcours live. Honour the same stop-after-first-failure
		// guard as onStepEnd so the live index stays aligned with the file output.
		if (this._stopped) return;
		if (!isKeptStep(step)) return;
		console.log(
			`__OTL_STEP__${JSON.stringify({ phase: "begin", title: String(step.title) })}`,
		);
	}
	onStepEnd(_test, _result, step) {
		if (this._stopped) return;
		const title = String(step.title);
		if (!isKeptStep(step)) return;
		const failed = Boolean(step.error);
		const durationMs = typeof step.duration === "number" ? step.duration : 0;
		const error = failed
			? step.error && (step.error.message || step.error.stack)
				? step.error.message || step.error.stack
				: "Échec de l'étape"
			: undefined;
		// Live "end" marker, matched by order to the "begin" emitted above.
		console.log(
			`__OTL_STEP__${JSON.stringify({
				phase: "end",
				title,
				status: failed ? "failed" : "passed",
				durationMs,
				error,
			})}`,
		);
		this._steps.push({
			title: step.title,
			durationMs,
			status: failed ? "failed" : "passed",
			error,
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
