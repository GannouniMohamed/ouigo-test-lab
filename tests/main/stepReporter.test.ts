import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-steps-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

it("le reporter custom capte les étapes page.*/expect et exclut l'infra", () => {
	writeFileSync(
		join(dir, "s.spec.ts"),
		[
			'import { expect, test } from "@playwright/test";',
			'test("p", async ({ page }) => {',
			'  await page.goto("data:text/html,<h1>Bonjour</h1>");',
			'  await expect(page.locator("h1")).toHaveText("Bonjour");',
			'  await page.goto("data:text/html,<h1>Bonjour</h1>");',
			"});",
		].join("\n"),
		"utf-8",
	);
	const stepsOut = join(dir, "steps.json");
	execFileSync(
		process.platform === "win32" ? "npx.cmd" : "npx",
		[
			"playwright",
			"test",
			"--config",
			join(REPO, "playwright.runner.config.ts"),
		],
		{
			cwd: REPO,
			env: {
				...process.env,
				OTL_TEST_DIR: dir,
				OTL_JSON_OUT: join(dir, "pw.json"),
				OTL_STEPS_OUT: stepsOut,
				OTL_ARTIFACTS: join(dir, "art"),
				NODE_PATH: join(REPO, "node_modules"),
			},
			stdio: "pipe",
		},
	);
	expect(existsSync(stepsOut)).toBe(true);
	const steps = JSON.parse(readFileSync(stepsOut, "utf-8")) as Array<{
		title: string;
		status: string;
	}>;
	const titles = steps.map((s) => s.title);
	// page.goto x2 + expect.toHaveText, no browser*/hook/fixture
	expect(titles.some((t) => t.startsWith("page.goto"))).toBe(true);
	expect(titles.some((t) => t.startsWith("expect"))).toBe(true);
	expect(titles.some((t) => t.startsWith("browser"))).toBe(false);
	expect(steps.length).toBeGreaterThanOrEqual(3);
	expect(steps.every((s) => s.status === "passed")).toBe(true);
});
