import { create } from "zustand";
import type { Project, Scenario } from "../shared/types";

const ACTIVE_KEY = "otl.activeProjectId";

function readActiveId(): string {
	try {
		return localStorage.getItem(ACTIVE_KEY) ?? "";
	} catch {
		return "";
	}
}

function writeActiveId(id: string): void {
	try {
		localStorage.setItem(ACTIVE_KEY, id);
	} catch {
		/* ignore */
	}
}

const ENV_KEY = "otl.activeEnvByProject";

function readActiveEnvMap(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}") as Record<
			string,
			string
		>;
	} catch {
		return {};
	}
}

function writeActiveEnvMap(map: Record<string, string>): void {
	try {
		localStorage.setItem(ENV_KEY, JSON.stringify(map));
	} catch {
		/* ignore */
	}
}

interface AppState {
	scenarios: Scenario[];
	setScenarios: (s: Scenario[]) => void;
	projects: Project[];
	activeProjectId: string;
	setProjects: (p: Project[]) => void;
	setActiveProjectId: (id: string) => void;
	loadProjects: () => Promise<void>;
	activeEnvByProject: Record<string, string>;
	setActiveEnv: (projectId: string, envId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
	scenarios: [],
	setScenarios: (scenarios) => set({ scenarios }),
	projects: [],
	activeProjectId: readActiveId(),
	setProjects: (projects) => set({ projects }),
	setActiveProjectId: (id) => {
		writeActiveId(id);
		set({ activeProjectId: id });
	},
	loadProjects: async () => {
		const projects = await window.api.listProjects();
		const stored = get().activeProjectId;
		const valid = projects.some((p) => p.id === stored);
		const activeProjectId = valid ? stored : (projects[0]?.id ?? "");
		writeActiveId(activeProjectId);
		set({ projects, activeProjectId });
	},
	activeEnvByProject: readActiveEnvMap(),
	setActiveEnv: (projectId, envId) => {
		const next = { ...get().activeEnvByProject, [projectId]: envId };
		writeActiveEnvMap(next);
		set({ activeEnvByProject: next });
	},
}));
