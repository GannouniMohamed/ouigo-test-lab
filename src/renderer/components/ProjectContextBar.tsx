import { useLocation } from "react-router-dom";
import { useAppStore } from "../store";
import { Breadcrumb } from "./Breadcrumb";
import { Select } from "./Select";

export function ProjectContextBar(): JSX.Element | null {
	const { pathname } = useLocation();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
	const setActiveEnv = useAppStore((s) => s.setActiveEnv);

	if (pathname.startsWith("/projects")) return null;

	const project = projects.find((p) => p.id === activeProjectId) ?? null;
	const envId = activeEnvByProject[activeProjectId] ?? "";
	// Show the project's first environment as the displayed default when none is
	// explicitly chosen — avoids an empty "Environnement" placeholder WITHOUT
	// writing into activeEnvByProject (runs keep inheriting the scenario default
	// until the user actually picks one here).
	const displayedEnvId = envId || project?.environments?.[0]?.id || "";

	return (
		<div className="otl-ctxbar">
			<div className="otl-ctxbar__crumb">
				<Breadcrumb />
			</div>
			<div className="otl-ctxbar__env">
				<span className="otl-ctxbar__envlabel">Environnement</span>
				<Select
					ariaLabel="Environnement actif"
					value={displayedEnvId}
					onChange={(v) => setActiveEnv(activeProjectId, v)}
					options={(project?.environments ?? []).map((e) => ({
						value: e.id,
						label: e.label,
					}))}
					placeholder="Environnement"
				/>
			</div>
		</div>
	);
}
