import { contextBridge, ipcRenderer } from "electron";
import type {
	BatchEvent,
	BatchOptions,
	Environment,
	Platform,
	Project,
	RunEvent,
	Tunnel,
} from "../shared/types";

contextBridge.exposeInMainWorld("api", {
	platform: process.platform,
	windowControls: {
		minimize() {
			ipcRenderer.send("window:minimize");
		},
		maximize() {
			ipcRenderer.send("window:maximize");
		},
		close() {
			ipcRenderer.send("window:close");
		},
	},
	browsersReady() {
		return ipcRenderer.invoke("browsers:ready");
	},
	installBrowsers() {
		return ipcRenderer.invoke("browsers:install");
	},

	mobileDoctor() {
		return ipcRenderer.invoke("mobile:doctor");
	},
	listDevices() {
		return ipcRenderer.invoke("mobile:listDevices");
	},
	startDevice() {
		return ipcRenderer.invoke("mobile:startDevice");
	},

	listProjects() {
		return ipcRenderer.invoke("project:list");
	},
	getProject(id: string) {
		return ipcRenderer.invoke("project:get", id);
	},
	createProject(input: {
		name: string;
		description: string;
		environments?: Array<{ label: string; baseURL: string }>;
	}) {
		return ipcRenderer.invoke("project:create", input);
	},
	updateProject(p: Project) {
		return ipcRenderer.invoke("project:update", p);
	},
	deleteProject(id: string) {
		return ipcRenderer.invoke("project:delete", id);
	},

	listEnvironments(projectId: string) {
		return ipcRenderer.invoke("environment:list", projectId);
	},
	saveEnvironment(projectId: string, env: Environment) {
		return ipcRenderer.invoke("environment:save", projectId, env);
	},
	deleteEnvironment(projectId: string, envId: string) {
		return ipcRenderer.invoke("environment:delete", projectId, envId);
	},

	listTunnels(projectId: string) {
		return ipcRenderer.invoke("tunnel:list", projectId);
	},
	createTunnel(input: {
		projectId: string;
		name: string;
		color?: string;
		description?: string;
	}) {
		return ipcRenderer.invoke("tunnel:create", input);
	},
	updateTunnel(t: Tunnel) {
		return ipcRenderer.invoke("tunnel:update", t);
	},
	deleteTunnel(projectId: string, tunnelId: string) {
		return ipcRenderer.invoke("tunnel:delete", projectId, tunnelId);
	},

	listScenariosByProject(projectId: string) {
		return ipcRenderer.invoke("scenario:listByProject", projectId);
	},
	deleteScenario(projectId: string, tunnelId: string, scenarioId: string) {
		return ipcRenderer.invoke(
			"scenario:delete",
			projectId,
			tunnelId,
			scenarioId,
		);
	},
	runScenario(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
		opts?: { headed?: boolean; specDraft?: string },
	) {
		return ipcRenderer.invoke(
			"scenario:run",
			projectId,
			tunnelId,
			scenarioId,
			envId,
			opts,
		);
	},
	getScenarioSpec(projectId: string, tunnelId: string, scenarioId: string) {
		return ipcRenderer.invoke(
			"scenario:getSpec",
			projectId,
			tunnelId,
			scenarioId,
		);
	},
	saveScenarioSpec(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		spec: string,
	) {
		return ipcRenderer.invoke(
			"scenario:saveSpec",
			projectId,
			tunnelId,
			scenarioId,
			spec,
		);
	},
	runBatch(
		projectId: string,
		tunnelId: string,
		scenarioId: string,
		envId: string,
		options: BatchOptions,
	) {
		return ipcRenderer.invoke(
			"scenario:runBatch",
			projectId,
			tunnelId,
			scenarioId,
			envId,
			options,
		);
	},
	getBatch(batchId: string) {
		return ipcRenderer.invoke("batch:get", batchId);
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
	onBatchEvent(batchId: string, cb: (e: BatchEvent) => void) {
		const channel = `batch-event:${batchId}`;
		const listener = (_e: Electron.IpcRendererEvent, payload: BatchEvent) =>
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

	startRecording(opts: {
		name: string;
		browser: "chromium" | "firefox" | "webkit";
		environmentId: string;
		projectId: string;
		tunnelId: string;
		platform?: Platform;
	}) {
		return ipcRenderer.invoke("recording:start", opts);
	},
	stopRecording(recordingId: string) {
		return ipcRenderer.invoke("recording:stop", recordingId);
	},
});
