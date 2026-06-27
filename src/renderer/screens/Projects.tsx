import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project } from "../../shared/types";
import { useAppStore } from "../store";

export default function Projects(): JSX.Element {
	const navigate = useNavigate();
	const projects = useAppStore((s) => s.projects);
	const loadProjects = useAppStore((s) => s.loadProjects);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const [counts, setCounts] = useState<Record<string, number>>({});
	const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	useEffect(() => {
		let cancelled = false;
		Promise.all(
			projects.map(async (p) => {
				const list = await window.api.listScenariosByProject(p.id);
				return [p.id, list.length] as const;
			}),
		).then((pairs) => {
			if (!cancelled) setCounts(Object.fromEntries(pairs));
		});
		return () => {
			cancelled = true;
		};
	}, [projects]);

	function open(p: Project): void {
		setActiveProjectId(p.id);
		navigate("/scenarios");
	}
	async function confirmDelete(): Promise<void> {
		if (!pendingDelete) return;
		await window.api.deleteProject(pendingDelete.id);
		setPendingDelete(null);
		await loadProjects();
	}

	return (
		<div className="otl-screen">
			<div className="otl-projects-header">
				<div>
					<h1 className="otl-hub-title">Projets</h1>
					<p className="otl-hub-subtitle">
						Chaque projet regroupe ses environnements et ses scénarios de test.
					</p>
				</div>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={() => navigate("/projects/new")}
				>
					+ Nouveau projet
				</button>
			</div>

			{projects.length === 0 ? (
				<div className="otl-empty">
					<div className="otl-empty__icon" aria-hidden="true">
						<svg
							aria-hidden="true"
							width="46"
							height="46"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.4"
						>
							<path
								d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
					<div className="otl-empty__title">Aucun projet pour l'instant</div>
					<p className="otl-empty__sub">
						Créez votre premier projet, ajoutez ses environnements (Préprod,
						Recette…) puis enregistrez vos scénarios de test.
					</p>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() => navigate("/projects/new")}
					>
						+ Créer mon premier projet
					</button>
				</div>
			) : (
				<div className="otl-project-grid">
					{projects.map((p) => (
						<div key={p.id} className="otl-card otl-project-card">
							<div className="otl-project-card__top">
								<span className="otl-project-card__icon" aria-hidden="true">
									<svg
										aria-hidden="true"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.6"
									>
										<circle cx="12" cy="12" r="9" />
										<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
									</svg>
								</span>
								<div className="otl-project-card__head">
									<div className="otl-card__name">{p.name}</div>
									<div className="otl-card__meta">{p.description || "—"}</div>
								</div>
								<button
									type="button"
									className="otl-project-card__del"
									aria-label="Supprimer le projet"
									disabled={projects.length <= 1}
									onClick={() => setPendingDelete(p)}
								>
									<svg
										aria-hidden="true"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.8"
									>
										<path
											d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							</div>
							<div className="otl-project-card__pills">
								<span className="otl-pill">
									{p.environments.length} environnements
								</span>
								<span className="otl-pill">{counts[p.id] ?? 0} scénarios</span>
							</div>
							<div className="otl-project-card__actions">
								<button
									type="button"
									className="otl-btn-launch"
									onClick={() => open(p)}
								>
									Ouvrir ›
								</button>
								<button
									type="button"
									className="otl-tab"
									aria-label={`Configurer les environnements de ${p.name}`}
									onClick={() => navigate(`/projects/${p.id}/environments`)}
								>
									Environnements
								</button>
							</div>
						</div>
					))}
				</div>
			)}

			{pendingDelete && (
				<div className="otl-modal-overlay">
					<dialog
						open
						className="otl-modal"
						aria-label={`Supprimer le projet ${pendingDelete.name}`}
					>
						<h2 className="otl-modal__title">
							Supprimer le projet « {pendingDelete.name} » ?
						</h2>
						<p className="otl-modal__subtitle">
							Cette action est irréversible et supprime aussi tout l'historique
							d'exécutions de ce projet.
						</p>
						<div className="otl-modal__actions">
							<button
								type="button"
								className="otl-tab"
								onClick={() => setPendingDelete(null)}
							>
								Annuler
							</button>
							<button
								type="button"
								className="otl-btn-danger"
								onClick={confirmDelete}
							>
								Supprimer définitivement
							</button>
						</div>
					</dialog>
				</div>
			)}
		</div>
	);
}
