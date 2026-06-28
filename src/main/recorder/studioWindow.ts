import { BrowserWindow } from "electron";

// Ouvre Maestro Studio dans une fenêtre de l'app (durcie). Aucune surface
// node/IPC exposée à la page ; navigation hors localhost bloquée. Non couvert
// en unitaire (Electron) — injecté via deps dans le recorder.
export function openStudioWindow(
	url: string,
	opts: { onClosed: () => void },
): { close: () => void } {
	const win = new BrowserWindow({
		width: 1100,
		height: 800,
		title: "Maestro Studio — Enregistrement",
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	// Bloque toute navigation hors du serveur Studio local.
	win.webContents.on("will-navigate", (e, target) => {
		if (!target.startsWith("http://localhost:9999")) e.preventDefault();
	});
	win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	let closedNotified = false;
	win.on("closed", () => {
		if (!closedNotified) {
			closedNotified = true;
			opts.onClosed();
		}
	});
	void win.loadURL(url);
	return {
		close: () => {
			closedNotified = true; // close programmatique → pas de onClosed (évite la double-annulation)
			if (!win.isDestroyed()) win.close();
		},
	};
}
