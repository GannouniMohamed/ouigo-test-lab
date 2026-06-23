import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	reporter: "list",
	timeout: 180_000,
	fullyParallel: false,
	workers: 1,
});
