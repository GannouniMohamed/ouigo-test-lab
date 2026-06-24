import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

interface EnvRow {
	label: string;
	baseURL: string;
}

function isValidUrl(u: string): boolean {
	return /^https?:\/\//.test(u.trim());
}

export default function NewProject(): JSX.Element {
	const navigate = useNavigate();
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const loadProjects = useAppStore((s) => s.loadProjects);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [rows, setRows] = useState<EnvRow[]>([
		{ label: "Préprod", baseURL: "" },
		{ label: "Recette", baseURL: "" },
	]);

	function updateRow(i: number, patch: Partial<EnvRow>): void {
		setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
	}
	function addRow(): void {
		setRows((rs) => [...rs, { label: "", baseURL: "" }]);
	}
	function removeRow(i: number): void {
		setRows((rs) => rs.filter((_, idx) => idx !== i));
	}

	// Lignes "réelles" : au moins un libellé ou une URL renseignés.
	const filled = rows.filter((r) => r.label.trim() || r.baseURL.trim());
	const missingUrls = filled.filter((r) => !r.baseURL.trim()).length;
	const invalidUrls = filled.filter(
		(r) => r.baseURL.trim() && !isValidUrl(r.baseURL),
	).length;
	const allLabelled = filled.every((r) => r.label.trim());
	const canCreate =
		name.trim().length > 0 &&
		filled.length > 0 &&
		missingUrls === 0 &&
		invalidUrls === 0 &&
		allLabelled;

	async function handleCreate(): Promise<void> {
		if (!canCreate) return;
		const project = await window.api.createProject({
			name: name.trim(),
			description,
			environments: filled.map((r) => ({
				label: r.label.trim(),
				baseURL: r.baseURL.trim(),
			})),
		});
		await loadProjects();
		setActiveProjectId(project.id);
		navigate("/scenarios");
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
				<span>Nouveau projet</span>
			</nav>

			<h1 className="otl-hub-title">Nouveau projet</h1>

			<div className="otl-create">
				<div>
					<div className="otl-field-label">Nom du projet</div>
					<input
						className="otl-input"
						placeholder="Nom du projet"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Description</div>
					<textarea
						className="otl-input otl-textarea"
						placeholder="Description (optionnel)"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<div>
					<div className="otl-create__envhead">
						<span className="otl-field-label">Environnements</span>
						{missingUrls > 0 && (
							<span className="otl-create__warn">
								{missingUrls} URL manquante{missingUrls > 1 ? "s" : ""}
							</span>
						)}
					</div>
					<p className="otl-hub-subtitle">
						Chaque environnement (Préprod, Recette…) pointe vers une URL Web
						testable.
					</p>

					{rows.map((row, i) => {
						const urlBad =
							row.baseURL.trim() === ""
								? row.label.trim()
									? "missing"
									: ""
								: !isValidUrl(row.baseURL)
									? "invalid"
									: "";
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
							<div className="otl-envrow" key={i}>
								<input
									className="otl-input otl-envrow__label"
									placeholder="Libellé"
									value={row.label}
									onChange={(e) => updateRow(i, { label: e.target.value })}
								/>
								<div className="otl-envrow__urlwrap">
									<input
										className={`otl-input${urlBad ? " otl-input--error" : ""}`}
										placeholder="https://…"
										value={row.baseURL}
										onChange={(e) => updateRow(i, { baseURL: e.target.value })}
									/>
									{urlBad === "missing" && (
										<span className="otl-envrow__err">
											L'URL est requise pour cet environnement.
										</span>
									)}
									{urlBad === "invalid" && (
										<span className="otl-envrow__err">
											URL invalide — elle doit commencer par https://
										</span>
									)}
								</div>
								<button
									type="button"
									className="otl-envrow__remove"
									aria-label="Supprimer l'environnement"
									onClick={() => removeRow(i)}
								>
									–
								</button>
							</div>
						);
					})}
					<button type="button" className="otl-tab" onClick={addRow}>
						+ Ajouter un environnement
					</button>
				</div>

				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canCreate}
						onClick={handleCreate}
					>
						Créer le projet
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/projects")}
					>
						Annuler
					</button>
					{!canCreate && (
						<span className="otl-create__hint">
							Renseignez une URL valide pour chaque environnement.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
