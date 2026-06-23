import { BrowserWindow, ipcMain } from "electron";
import type { Environment } from "../../shared/types";
import { installBrowser } from "../runner/ensureBrowsers";
import { playwrightRunner } from "../runner/playwrightRunner";
import { getEnvironment } from "../stores/environmentStore";
import {
	handleBrowsersReady,
	handleDeleteScenario,
	handleGetReport,
	handleGetScenario,
	handleListEnvironments,
	handleListReports,
	handleListScenarios,
	handleSaveEnvironment,
} from "./handlers";
import { handleStartRecording, handleStopRecording } from "./recordingHandlers";

export function registerIpc(): void {
	// Custom title-bar window controls (Windows/Linux frameless chrome).
	ipcMain.on("window:minimize", (e) =>
		BrowserWindow.fromWebContents(e.sender)?.minimize(),
	);
	ipcMain.on("window:maximize", (e) => {
		const w = BrowserWindow.fromWebContents(e.sender);
		if (!w) return;
		if (w.isMaximized()) w.unmaximize();
		else w.maximize();
	});
	ipcMain.on("window:close", (e) =>
		BrowserWindow.fromWebContents(e.sender)?.close(),
	);

	ipcMain.handle("browsers:ready", () => handleBrowsersReady());
	ipcMain.handle("browsers:install", async () => {
		await installBrowser("chromium");
		return true;
	});

	ipcMain.handle("scenario:list", () => handleListScenarios());

	ipcMain.handle("scenario:get", (_e, id: string) => handleGetScenario(id));

	ipcMain.handle("scenario:delete", (_e, id: string) =>
		handleDeleteScenario(id),
	);

	ipcMain.handle("environment:list", () => handleListEnvironments());

	ipcMain.handle("environment:save", (_e, env: Environment) =>
		handleSaveEnvironment(env),
	);

	ipcMain.handle("report:list", (_e, scenarioId?: string) =>
		handleListReports(scenarioId),
	);

	ipcMain.handle("report:get", (_e, runId: string) => handleGetReport(runId));

	ipcMain.handle(
		"scenario:run",
		async (event, scenarioId: string, envId: string) => {
			const scenario = handleGetScenario(scenarioId);
			const env = getEnvironment(envId);

			let runId = "";
			const ready = new Promise<string>((resolve) => {
				void playwrightRunner.run(scenario, env, (e) => {
					if (e.type === "run-started") {
						runId = e.runId;
						resolve(runId);
					}
					if (runId) event.sender.send(`run-event:${runId}`, e);
				});
			});

			return { runId: await ready };
		},
	);

	ipcMain.handle("run:cancel", (_e, runId: string) =>
		playwrightRunner.cancel(runId),
	);

	ipcMain.handle("recording:start", (_e, opts) => handleStartRecording(opts));
	ipcMain.handle("recording:stop", (_e, id: string) => handleStopRecording(id));
}
