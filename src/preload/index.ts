import { contextBridge, ipcRenderer } from "electron";
import type { Environment, RunEvent } from "../shared/types";

contextBridge.exposeInMainWorld("api", {
	browsersReady() {
		return ipcRenderer.invoke("browsers:ready");
	},

	installBrowsers() {
		return ipcRenderer.invoke("browsers:install");
	},

	listScenarios() {
		return ipcRenderer.invoke("scenario:list");
	},

	getScenario(id: string) {
		return ipcRenderer.invoke("scenario:get", id);
	},

	deleteScenario(id: string) {
		return ipcRenderer.invoke("scenario:delete", id);
	},

	listEnvironments() {
		return ipcRenderer.invoke("environment:list");
	},

	saveEnvironment(env: Environment) {
		return ipcRenderer.invoke("environment:save", env);
	},

	runScenario(scenarioId: string, envId: string) {
		return ipcRenderer.invoke("scenario:run", scenarioId, envId);
	},

	cancelRun(runId: string) {
		return ipcRenderer.invoke("run:cancel", runId);
	},

	onRunEvent(runId: string, cb: (e: RunEvent) => void) {
		const channel = `run-event:${runId}`;
		const listener = (_e: Electron.IpcRendererEvent, payload: RunEvent) =>
			cb(payload);
		ipcRenderer.on(channel, listener);
		return () => ipcRenderer.removeListener(channel, listener);
	},

	listReports(scenarioId?: string) {
		return ipcRenderer.invoke("report:list", scenarioId);
	},

	getReport(runId: string) {
		return ipcRenderer.invoke("report:get", runId);
	},
});
