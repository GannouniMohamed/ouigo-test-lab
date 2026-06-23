import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function browsersCacheDir(): string {
	if (process.env.PLAYWRIGHT_BROWSERS_PATH)
		return process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (process.platform === "darwin")
		return join(homedir(), "Library", "Caches", "ms-playwright");
	if (process.platform === "win32")
		return join(homedir(), "AppData", "Local", "ms-playwright");
	return join(homedir(), ".cache", "ms-playwright");
}

export function isBrowserInstalled(
	browser = "chromium",
	cacheDir = browsersCacheDir(),
): boolean {
	if (!existsSync(cacheDir)) return false;
	return readdirSync(cacheDir).some((name) => name.startsWith(`${browser}-`));
}

export function installBrowser(
	browser = "chromium",
	onLine: (line: string) => void = () => {},
): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn("npx", ["playwright", "install", browser], {
			env: process.env,
		});
		const emit = (b: Buffer) => {
			for (const l of b.toString().split("\n")) if (l.trim()) onLine(l);
		};
		child.stdout?.on("data", emit);
		child.stderr?.on("data", emit);
		child.on("close", (code) => resolve(code ?? 0));
	});
}
