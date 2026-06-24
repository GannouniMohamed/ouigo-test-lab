import { useEffect, useState } from "react";
import type { Environment, Project } from "../../shared/types";
import { useAppStore } from "../store";

export default function Projects(): JSX.Element {
	const loadProjects = useAppStore((s) => s.loadProjects);
	const [projects, setProjects] = useState<Project[]>([]);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [selectedId, setSelectedId] = useState("");

	async function refresh(): Promise<void> {
		const list = await window.api.listProjects();
		setProjects(list);
		await loadProjects();
		if (!selectedId && list[0]) setSelectedId(list[0].id);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: single-shot load on mount
	useEffect(() => {
		refresh();
	}, []);

	async function handleCreate(): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) return;
		await window.api.createProject({ name: trimmed, description });
		setName("");
		setDescription("");
		await refresh();
	}

	async function handleDelete(id: string): Promise<void> {
		await window.api.deleteProject(id);
		if (selectedId === id) setSelectedId("");
		await refresh();
	}

	const selected = projects.find((p) => p.id === selectedId) ?? null;

	return (
		<div style={{ padding: "2rem" }}>
			<h1 className="otl-hub-title">Projets</h1>
			<p className="otl-hub-subtitle">
				Organisez vos tests par projet et gérez leurs environnements.
			</p>

			<div className="otl-projects-create">
				<input
					type="text"
					className="otl-input"
					placeholder="Nom du projet"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<input
					type="text"
					className="otl-input"
					placeholder="Description (optionnel)"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={handleCreate}
				>
					Créer le projet
				</button>
			</div>

			<div className="otl-card-list" style={{ marginTop: "1.25rem" }}>
				{projects.map((p) => (
					<div key={p.id} className="otl-card">
						<div className="otl-card__body">
							<div className="otl-card__name">{p.name}</div>
							<div className="otl-card__meta">
								{p.description || "—"} · {p.environments.length} env.
							</div>
						</div>
						<div className="otl-card__right">
							<button
								type="button"
								className="otl-tab"
								onClick={() => setSelectedId(p.id)}
							>
								Environnements
							</button>
							<button
								type="button"
								className="otl-btn-stop"
								onClick={() => handleDelete(p.id)}
								disabled={projects.length <= 1}
							>
								Supprimer
							</button>
						</div>
					</div>
				))}
			</div>

			{selected && <EnvironmentEditor project={selected} onChanged={refresh} />}
		</div>
	);
}

function EnvironmentEditor({
	project,
	onChanged,
}: {
	project: Project;
	onChanged: () => Promise<void>;
}): JSX.Element {
	const [label, setLabel] = useState("");
	const [baseURL, setBaseURL] = useState("");

	async function addEnv(): Promise<void> {
		const trimmed = label.trim();
		if (!trimmed) return;
		const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		const env: Environment = { id, label: trimmed, baseURL, variables: {} };
		await window.api.saveEnvironment(project.id, env);
		setLabel("");
		setBaseURL("");
		await onChanged();
	}

	async function removeEnv(envId: string): Promise<void> {
		await window.api.deleteEnvironment(project.id, envId);
		await onChanged();
	}

	return (
		<div className="otl-env-editor">
			<h2 className="otl-tunnel-group__title">
				Environnements — {project.name}
			</h2>
			<div className="otl-card-list">
				{project.environments.map((e) => (
					<div key={e.id} className="otl-card">
						<div className="otl-card__body">
							<div className="otl-card__name">{e.label}</div>
							<div className="otl-card__meta">{e.baseURL}</div>
						</div>
						<div className="otl-card__right">
							<button
								type="button"
								className="otl-btn-stop"
								onClick={() => removeEnv(e.id)}
								disabled={project.environments.length <= 1}
							>
								Supprimer
							</button>
						</div>
					</div>
				))}
			</div>
			<div className="otl-projects-create" style={{ marginTop: "0.75rem" }}>
				<input
					type="text"
					className="otl-input"
					placeholder="Libellé (ex : Production)"
					value={label}
					onChange={(e) => setLabel(e.target.value)}
				/>
				<input
					type="text"
					className="otl-input"
					placeholder="https://…"
					value={baseURL}
					onChange={(e) => setBaseURL(e.target.value)}
				/>
				<button type="button" className="otl-btn-primary" onClick={addEnv}>
					Ajouter
				</button>
			</div>
		</div>
	);
}
