const fs = require("node:fs");

// Custom Playwright reporter: captures user-meaningful steps (page.* / locator.* /
// expect.*) that the built-in JSON reporter omits from result.steps, and writes
// them to OTL_STEPS_OUT so the runner can surface real steps for recorded specs.
class StepReporter {
	constructor() {
		this._steps = [];
	}
	onStepEnd(_test, _result, step) {
		const cat = step.category;
		const keep =
			cat === "expect" ||
			(cat === "pw:api" && !String(step.title).startsWith("browser"));
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
