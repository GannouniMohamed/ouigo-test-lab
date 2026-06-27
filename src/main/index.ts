import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { registerIpc } from "./ipc/register";
import { migrateWorkspaceIfNeeded } from "./migration";
import { killAllRecordings } from "./recorder/maestroRecorder";
import { seedIfEmpty } from "./seed";
import { ensureWorkspace } from "./workspace";

function createWindow(): void {
	const isMac = process.platform === "darwin";
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 960,
		minHeight: 640,
		backgroundColor: "#06080d",
		show: false,
		// One unified title bar — never a native bar AND our custom bar.
		// macOS: `hidden` keeps the native traffic lights but removes the native
		// title bar, so only our custom draggable bar shows. Windows/Linux:
		// fully frameless — the renderer draws the min/max/close controls.
		...(isMac
			? {
					titleBarStyle: "hidden" as const,
					trafficLightPosition: { x: 18, y: 18 },
				}
			: { frame: false }),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: join(__dirname, "../preload/index.js"),
		},
	});

	win.once("ready-to-show", () => win.show());

	// In development, electron-vite provides a dev server URL
	if (process.env.ELECTRON_RENDERER_URL) {
		win.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		win.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

app.whenReady().then(() => {
	const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
	ensureWorkspace();
	migrateWorkspaceIfNeeded();
	seedIfEmpty(appRoot);
	registerIpc();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("before-quit", () => {
	killAllRecordings();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
