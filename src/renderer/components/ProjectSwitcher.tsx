import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

export function ProjectSwitcher(): JSX.Element {
	const navigate = useNavigate();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

	return (
		<div className="otl-projectbar">
			<div className="otl-projectbar__left">
				<span className="otl-projectbar__label">Projet</span>
				<select
					className="otl-select"
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
				<button
					type="button"
					className="otl-projectbar__manage"
					onClick={() => navigate("/projects")}
				>
					Gérer les projets
				</button>
			</div>
		</div>
	);
}
