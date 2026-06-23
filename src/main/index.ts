import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { registerIpc } from "./ipc/register";
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
		// macOS: keep the native traffic lights but hide the bar and inset them so
		// our custom draggable title bar sits behind them. Windows/Linux: fully
		// frameless — the renderer draws Fluent-style min/max/close controls.
		titleBarStyle: isMac ? "hiddenInset" : "default",
		trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
		frame: isMac,
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
	seedIfEmpty(appRoot);
	registerIpc();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
