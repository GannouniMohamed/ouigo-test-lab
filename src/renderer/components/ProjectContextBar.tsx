import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

export function ProjectContextBar(): JSX.Element | null {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
	const setActiveEnv = useAppStore((s) => s.setActiveEnv);

	if (pathname.startsWith("/projects")) return null;

	const project = projects.find((p) => p.id === activeProjectId) ?? null;
	const envId = activeEnvByProject[activeProjectId] ?? "";

	return (
		<div className="otl-ctxbar">
			<div className="otl-ctxbar__crumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<select
					className="otl-select otl-ctxbar__project"
					aria-label="Projet actif"
					value={activeProjectId}
					onChange={(e) => setActiveProjectId(e.target.value)}
				>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</div>
			<div className="otl-ctxbar__env">
				<span className="otl-ctxbar__envlabel">Environnement</span>
				<select
					className="otl-select"
					aria-label="Environnement actif"
					value={envId}
					onChange={(e) => setActiveEnv(activeProjectId, e.target.value)}
				>
					<option value="">Par défaut</option>
					{(project?.environments ?? []).map((env) => (
						<option key={env.id} value={env.id}>
							{env.label}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
