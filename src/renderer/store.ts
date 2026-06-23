import { create } from "zustand";
import type { Scenario } from "../shared/types";

interface AppState {
	scenarios: Scenario[];
	setScenarios: (s: Scenario[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
	scenarios: [],
	setScenarios: (scenarios) => set({ scenarios }),
}));
