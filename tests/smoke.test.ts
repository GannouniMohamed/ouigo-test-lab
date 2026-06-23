import { describe, expect, it } from "vitest";
import pkg from "../package.json";
describe("scaffold", () => {
	it("déclare les scripts essentiels", () => {
		expect(pkg.scripts.dev).toBeDefined();
		expect(pkg.scripts.build).toBeDefined();
		expect(pkg.scripts.test).toContain("vitest");
	});
	it("pinne playwright à une version exacte", () => {
		const v = pkg.devDependencies["@playwright/test"];
		expect(v).toMatch(/^\d+\.\d+\.\d+$/); // pas de ^ ni ~
	});
});
