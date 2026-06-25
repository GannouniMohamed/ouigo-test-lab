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

	return (
		<div className="otl-ctxbar">
			<div className="otl-ctxbar__crumb">
				<Breadcrumb />
			</div>
			<div className="otl-ctxbar__env">
				<span className="otl-ctxbar__envlabel">Environnement</span>
				<Select
					ariaLabel="Environnement actif"
					value={envId}
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
