import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import { EnvPicker } from "./EnvPicker";

export function ProjectSwitcher(): JSX.Element {
	const navigate = useNavigate();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const [envId, setEnvId] = useState("");

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
			<div className="otl-projectbar__right">
				<EnvPicker value={envId} onChange={setEnvId} />
			</div>
		</div>
	);
}
