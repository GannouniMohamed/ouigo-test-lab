import { BrowserWindow, ipcMain, shell } from "electron";
import type {
	BatchOptions,
	Environment,
	Project,
	RunOptions,
	Tunnel,
} from "../../shared/types";
import { installBrowser } from "../runner/ensureBrowsers";
import { maestroRunner } from "../runner/maestroRunner";
import { playwrightRunner } from "../runner/playwrightRunner";
import {
	handleBrowsersReady,
	handleCreateProject,
	handleCreateTunnel,
	handleDeleteEnvironment,
	handleDeleteProject,
	handleDeleteScenario,
	handleDeleteTunnel,
	handleGetBatch,
	handleGetProject,
	handleGetReport,
	handleGetScenarioSpec,
	handleListEnvironments,
	handleListProjects,
	handleListReports,
	handleListScenariosByProject,
	handleListTunnels,
	handleRunBatch,
	handleRunScenario,
	handleSaveEnvironment,
	handleSaveScenarioSpec,
	handleUpdateProject,
	handleUpdateTunnel,
} from "./handlers";
import {
	handleInstallApp,
	handleInstallMaestro,
	handleListDevices,
	handleMobileDoctor,
	handleStartDevice,
} from "./mobileHandlers";
import {
	handleCancelRecording,
	handleStartRecording,
	handleStopRecording,
} from "./recordingHandlers";

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
		(
			_e,
			input: {
				name: string;
				description: string;
				environments?: Array<{ label: string; baseURL: string }>;
			},
		) => handleCreateProject(input),
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
		(
			_e,
			input: {
				projectId: string;
				name: string;
				color?: string;
				description?: string;
			},
		) => handleCreateTunnel(input),
	);
	ipcMain.handle("tunnel:update", (_e, t: Tunnel) => handleUpdateTunnel(t));
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
		(
			event,
			projectId: string,
			tunnelId: string,
			scenarioId: string,
			envId: string,
			opts?: RunOptions,
		) =>
			handleRunScenario(
				projectId,
				tunnelId,
				scenarioId,
				envId,
				(channel, payload) => event.sender.send(channel, payload),
				opts,
			),
	);

	ipcMain.handle(
		"scenario:runBatch",
		(
			event,
			projectId: string,
			tunnelId: string,
			scenarioId: string,
			envId: string,
			options: BatchOptions,
		) =>
			handleRunBatch(
				projectId,
				tunnelId,
				scenarioId,
				envId,
				options,
				(channel, payload) => event.sender.send(channel, payload),
			),
	);

	ipcMain.handle("batch:get", (_e, batchId: string) => handleGetBatch(batchId));

	ipcMain.handle("run:cancel", async (_e, runId: string) => {
		// runId inconnu = no-op sûr côté chaque runner → on cible les deux.
		await playwrightRunner.cancel(runId);
		await maestroRunner.cancel(runId);
	});

	ipcMain.handle(
		"scenario:getSpec",
		(_e, projectId: string, tunnelId: string, scenarioId: string) =>
			handleGetScenarioSpec(projectId, tunnelId, scenarioId),
	);

	ipcMain.handle(
		"scenario:saveSpec",
		(
			_e,
			projectId: string,
			tunnelId: string,
			scenarioId: string,
			spec: string,
		) => handleSaveScenarioSpec(projectId, tunnelId, scenarioId, spec),
	);

	ipcMain.handle("recording:start", (_e, opts) => handleStartRecording(opts));
	ipcMain.handle("recording:stop", (_e, id: string, pastedFlow?: string) =>
		handleStopRecording(id, pastedFlow),
	);
	ipcMain.handle("recording:cancel", (_e, id: string) =>
		handleCancelRecording(id),
	);

	// Mobile (Maestro)
	ipcMain.handle("mobile:doctor", () => handleMobileDoctor());
	ipcMain.handle("mobile:listDevices", () => handleListDevices());
	ipcMain.handle("mobile:startDevice", () => handleStartDevice());
	ipcMain.handle("mobile:installMaestro", () => handleInstallMaestro());
	ipcMain.handle(
		"mobile:installApp",
		(_e, projectId: string, environmentId: string, deviceId: string) =>
			handleInstallApp(projectId, environmentId, deviceId),
	);
	ipcMain.handle("app:openExternal", (_e, url: string) => {
		// Garde-fou : on n'ouvre que du http(s) (les URLs sont fixées côté
		// renderer, mais le canal accepte n'importe quelle chaîne).
		if (!/^https?:\/\//i.test(url)) return Promise.resolve();
		return shell.openExternal(url);
	});
}
