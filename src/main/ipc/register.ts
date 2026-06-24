import { BrowserWindow, ipcMain } from "electron";
import type { Environment, Project } from "../../shared/types";
import { installBrowser } from "../runner/ensureBrowsers";
import { playwrightRunner } from "../runner/playwrightRunner";
import { getScenario } from "../stores/scenarioStore";
import {
	getEnvironment,
	handleBrowsersReady,
	handleCreateProject,
	handleCreateTunnel,
	handleDeleteEnvironment,
	handleDeleteProject,
	handleDeleteScenario,
	handleDeleteTunnel,
	handleGetProject,
	handleGetReport,
	handleListEnvironments,
	handleListProjects,
	handleListReports,
	handleListScenariosByProject,
	handleListTunnels,
	handleSaveEnvironment,
	handleUpdateProject,
} from "./handlers";
import { handleStartRecording, handleStopRecording } from "./recordingHandlers";

export function registerIpc(): void {
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

	// Projects
	ipcMain.handle("project:list", () => handleListProjects());
	ipcMain.handle("project:get", (_e, id: string) => handleGetProject(id));
	ipcMain.handle(
		"project:create",
		(_e, input: { name: string; description: string }) =>
			handleCreateProject(input),
	);
	ipcMain.handle("project:update", (_e, p: Project) => handleUpdateProject(p));
	ipcMain.handle("project:delete", (_e, id: string) => handleDeleteProject(id));

	// Environments (project-scoped)
	ipcMain.handle("environment:list", (_e, projectId: string) =>
		handleListEnvironments(projectId),
	);
	ipcMain.handle(
		"environment:save",
		(_e, projectId: string, env: Environment) =>
			handleSaveEnvironment(projectId, env),
	);
	ipcMain.handle("environment:delete", (_e, projectId: string, envId: string) =>
		handleDeleteEnvironment(projectId, envId),
	);

	// Tunnels
	ipcMain.handle("tunnel:list", (_e, projectId: string) =>
		handleListTunnels(projectId),
	);
	ipcMain.handle(
		"tunnel:create",
		(_e, input: { projectId: string; name: string }) =>
			handleCreateTunnel(input),
	);
	ipcMain.handle("tunnel:delete", (_e, projectId: string, tunnelId: string) =>
		handleDeleteTunnel(projectId, tunnelId),
	);

	// Scenarios
	ipcMain.handle("scenario:listByProject", (_e, projectId: string) =>
		handleListScenariosByProject(projectId),
	);
	ipcMain.handle(
		"scenario:delete",
		(_e, projectId: string, tunnelId: string, scenarioId: string) =>
			handleDeleteScenario(projectId, tunnelId, scenarioId),
	);

	ipcMain.handle("report:list", (_e, scenarioId?: string) =>
		handleListReports(scenarioId),
	);
	ipcMain.handle("report:get", (_e, runId: string) => handleGetReport(runId));

	ipcMain.handle(
		"scenario:run",
		async (
			event,
			projectId: string,
			tunnelId: string,
			scenarioId: string,
			envId: string,
		) => {
			const scenario = getScenario(projectId, tunnelId, scenarioId);
			const env = getEnvironment(projectId, envId);

			let runId = "";
			const ready = new Promise<string>((resolve) => {
				void playwrightRunner.run(scenario, env, (ev) => {
					if (ev.type === "run-started") {
						runId = ev.runId;
						resolve(runId);
					}
					if (runId) event.sender.send(`run-event:${runId}`, ev);
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
