import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBrowserInstalled } from "../../src/main/runner/ensureBrowsers";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "otl-pw-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("isBrowserInstalled", () => {
	it("false quand le cache est vide", () => {
		expect(isBrowserInstalled("chromium", dir)).toBe(false);
	});
	it("true quand un dossier chromium-* existe", () => {
		mkdirSync(join(dir, "chromium-1148"));
		expect(isBrowserInstalled("chromium", dir)).toBe(true);
	});
	it("false quand le cache n'existe pas", () => {
		expect(isBrowserInstalled("chromium", join(dir, "nope"))).toBe(false);
	});
});
