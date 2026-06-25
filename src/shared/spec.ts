import type { RecordedStep, RunMode, StepEditOp, StepScope } from "./types";
import { stepActiveInMode } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Recorded-spec engine: parse / edit / compile-for-mode.
//
// A recorded action is a statement `await page.…` or `await expect(…)`.
// Codegen emits one per user action. A step may carry a per-mode SCOPE, stored
// as an annotation comment so the line is plain, readable JS:
//
//   await page.x();                      // scope: both   (active)
//   // [otl:skip] await page.x();        // scope: skip
//   // [otl:visible] await page.x();     // scope: visible-only
//   // [otl:invisible] await page.x();   // scope: invisible-only
//
// Scoped lines are stored commented; the compiler (compileSpecForMode) emits
// an effective spec where lines applicable to the run mode are activated.
// ───────────────────────────────────────────────────────────────────────────

const SCOPE_MARKER: Record<Exclude<StepScope, "both">, string> = {
	skip: "// [otl:skip] ",
	visible: "// [otl:visible] ",
	invisible: "// [otl:invisible] ",
};

const ACTIVE_RE = /^(\s*)(await\s+(?:page|expect)\b.*)$/;
const SCOPED_RE =
	/^(\s*)\/\/ \[otl:(skip|visible|invisible)\] (await\s+(?:page|expect)\b.*)$/;

interface ParsedLine {
	indent: string;
	scope: StepScope;
	code: string; // the bare `await …;` statement
}

// Parse an action line (active or scoped), or return null if it is not one.
export function parseActionLine(line: string): ParsedLine | null {
	const scoped = SCOPED_RE.exec(line);
	if (scoped) {
		return {
			indent: scoped[1],
			scope: scoped[2] as StepScope,
			code: scoped[3],
		};
	}
	const active = ACTIVE_RE.exec(line);
	if (active) {
		return { indent: active[1], scope: "both", code: active[2] };
	}
	return null;
}

export function isActionLine(line: string): boolean {
	return parseActionLine(line) !== null;
}

function renderActionLine(p: ParsedLine): string {
	if (p.scope === "both") return `${p.indent}${p.code}`;
	return `${p.indent}${SCOPE_MARKER[p.scope]}${p.code}`;
}

function titleOf(code: string): string {
	let title = code.replace(/^await\s+/, "");
	const backtick = title.indexOf("`");
	if (backtick !== -1) title = `${title.slice(0, backtick).trimEnd()}…`;
	return title.replace(/;\s*$/, "");
}

export function parseRecordedSteps(spec: string): RecordedStep[] {
	const steps: RecordedStep[] = [];
	for (const line of spec.split("\n")) {
		const parsed = parseActionLine(line);
		if (!parsed) continue;
		const step: RecordedStep = {
			index: steps.length,
			title: titleOf(parsed.code),
		};
		if (parsed.scope !== "both") step.scope = parsed.scope;
		steps.push(step);
	}
	return steps;
}

// ── Editing ────────────────────────────────────────────────────────────────

function actionLineNumbers(lines: string[]): number[] {
	const nums: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (isActionLine(lines[i])) nums.push(i);
	}
	return nums;
}

function locate(
	spec: string,
	stepIndex: number,
): { lines: string[]; ln: number; parsed: ParsedLine } {
	const lines = spec.split("\n");
	const ln = actionLineNumbers(lines)[stepIndex];
	if (ln === undefined)
		throw new Error(`Step index out of range: ${stepIndex}`);
	const parsed = parseActionLine(lines[ln]);
	if (!parsed) throw new Error(`Not an action line: ${stepIndex}`);
	return { lines, ln, parsed };
}

export function deleteStep(spec: string, stepIndex: number): string {
	const { lines, ln } = locate(spec, stepIndex);
	lines.splice(ln, 1);
	return lines.join("\n");
}

export function setStepScope(
	spec: string,
	stepIndex: number,
	scope: StepScope,
): string {
	const { lines, ln, parsed } = locate(spec, stepIndex);
	lines[ln] = renderActionLine({ ...parsed, scope });
	return lines.join("\n");
}

// Replace the statement; the step keeps its current scope.
export function editStep(
	spec: string,
	stepIndex: number,
	newCode: string,
): string {
	const { lines, ln, parsed } = locate(spec, stepIndex);
	let code = newCode
		.trim()
		.replace(/^await\s+/, "")
		.replace(/;\s*$/, "");
	code = `await ${code};`;
	lines[ln] = renderActionLine({ ...parsed, code });
	return lines.join("\n");
}

export function applyStepEdit(spec: string, op: StepEditOp): string {
	switch (op.op) {
		case "delete":
			return deleteStep(spec, op.index);
		case "scope":
			return setStepScope(spec, op.index, op.scope);
		case "edit":
			return editStep(spec, op.index, op.code);
	}
}

// ── Compiling for a run mode ─────────────────────────────────────────────────

// Produce the spec that actually runs in `mode`: action lines applicable to the
// mode are activated; the rest are emitted as plain comments (Playwright skips
// them). Non-action lines pass through unchanged.
export function compileSpecForMode(spec: string, mode: RunMode): string {
	return spec
		.split("\n")
		.map((line) => {
			const parsed = parseActionLine(line);
			if (!parsed) return line;
			if (stepActiveInMode(parsed.scope, mode)) {
				return `${parsed.indent}${parsed.code}`;
			}
			return `${parsed.indent}// ${parsed.code}`;
		})
		.join("\n");
}
