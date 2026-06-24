import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Environment, Project } from "../../shared/types";

export default function ProjectEnvironments(): JSX.Element {
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const [project, setProject] = useState<Project | null>(null);
	const [rows, setRows] = useState<Environment[]>([]);

	async function load(): Promise<void> {
		const p = await window.api.getProject(id);
		setProject(p);
		setRows(p.environments);
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on id, load is stable intent
	useEffect(() => {
		load();
	}, [id]);

	function updateRow(envId: string, patch: Partial<Environment>): void {
		setRows((rs) => rs.map((r) => (r.id === envId ? { ...r, ...patch } : r)));
	}
	function addRow(): void {
		const base = "env";
		let nid = base;
		let n = 2;
		const ids = new Set(rows.map((r) => r.id));
		while (ids.has(nid)) nid = `${base}-${n++}`;
		setRows((rs) => [
			...rs,
			{ id: nid, label: "Nouvel environnement", baseURL: "", variables: {} },
		]);
	}

	async function save(): Promise<void> {
		// Upsert chaque ligne (id conservé), sans régénérer l'id.
		for (const r of rows) {
			await window.api.saveEnvironment(id, r);
		}
		await load();
	}

	async function remove(envId: string): Promise<void> {
		await window.api.deleteEnvironment(id, envId);
		await load();
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					← Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>{project?.name ?? "…"}</span>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Environnements</span>
			</nav>

			<div className="otl-create__envhead">
				<h1 className="otl-hub-title">Environnements</h1>
				<button type="button" className="otl-tab" onClick={addRow}>
					+ Ajouter
				</button>
			</div>
			<p className="otl-hub-subtitle">
				Modifiez le libellé et l'URL de chaque environnement du projet{" "}
				{project?.name ?? ""}.
			</p>

			<div className="otl-envtable">
				<div className="otl-envtable__head">
					<span className="otl-field-label">Libellé</span>
					<span className="otl-field-label">URL Web</span>
					<span />
				</div>
				{rows.map((r) => (
					<div className="otl-envrow" key={r.id}>
						<input
							className="otl-input otl-envrow__label"
							value={r.label}
							onChange={(e) => updateRow(r.id, { label: e.target.value })}
						/>
						<input
							className="otl-input otl-envrow__urlwrap"
							value={r.baseURL}
							onChange={(e) => updateRow(r.id, { baseURL: e.target.value })}
						/>
						<button
							type="button"
							className="otl-envrow__remove"
							aria-label="Supprimer l'environnement"
							disabled={rows.length <= 1}
							onClick={() => remove(r.id)}
						>
							–
						</button>
					</div>
				))}
			</div>

			<div className="otl-create__actions">
				<button type="button" className="otl-btn-primary" onClick={save}>
					Enregistrer les modifications
				</button>
				<button
					type="button"
					className="otl-tab"
					onClick={() => navigate("/projects")}
				>
					Annuler
				</button>
			</div>
		</div>
	);
}
