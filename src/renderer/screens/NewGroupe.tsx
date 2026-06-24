import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import type { Tunnel } from "../../shared/types";
import { ColorPalette } from "../components/ColorPalette";
import { useAppStore } from "../store";

export default function NewGroupe(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [name, setName] = useState("");
	const [color, setColor] = useState(DEFAULT_TUNNEL_COLOR);
	const [description, setDescription] = useState("");
	const [existing, setExisting] = useState<Tunnel[]>([]);

	const load = useCallback(async () => {
		if (!activeProjectId) return;
		setExisting(await window.api.listTunnels(activeProjectId));
	}, [activeProjectId]);
	useEffect(() => {
		load();
	}, [load]);

	const canCreate = name.trim().length > 0 && !!activeProjectId;

	async function handleCreate(): Promise<void> {
		if (!canCreate || !activeProjectId) return;
		await window.api.createTunnel({
			projectId: activeProjectId,
			name: name.trim(),
			color,
			description: description.trim(),
		});
		navigate("/scenarios");
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/scenarios")}
				>
					← Scénarios
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Nouveau groupe</span>
			</nav>
			<h1 className="otl-hub-title">Nouveau groupe</h1>
			<p className="otl-hub-subtitle">
				Un groupe rassemble des scénarios d'un même parcours (ex. tunnel de
				vente).
			</p>
			<div className="otl-create">
				<div>
					<div className="otl-field-label">Nom du groupe</div>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du groupe"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Couleur</div>
					<ColorPalette value={color} onChange={setColor} />
				</div>
				<div>
					<div className="otl-field-label">Description — optionnel</div>
					<textarea
						className="otl-input otl-textarea"
						placeholder="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
				<div>
					<div className="otl-field-label">Aperçu dans le hub</div>
					<div className="otl-group-preview">
						<span
							className="otl-group-dot"
							style={{ background: color }}
							aria-hidden="true"
						/>
						{name.trim() || "Nouveau groupe"}
						<span className="otl-tunnel-group__count">0</span>
						<span className="otl-group-stats">vide pour l'instant</span>
					</div>
				</div>
				{existing.length > 0 && (
					<div>
						<div className="otl-field-label">Groupes existants</div>
						<div className="otl-group-existing">
							{existing.map((t) => (
								<div key={t.id} className="otl-group-existing__row">
									<span
										className="otl-group-dot"
										style={{ background: t.color }}
										aria-hidden="true"
									/>
									{t.name}
								</div>
							))}
						</div>
					</div>
				)}
				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canCreate}
						onClick={handleCreate}
					>
						Créer le groupe
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/scenarios")}
					>
						Annuler
					</button>
				</div>
			</div>
		</div>
	);
}
