import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DEFAULT_TUNNEL_COLOR } from "../../shared/groups";
import type { Scenario, Tunnel } from "../../shared/types";
import { ColorPalette } from "../components/ColorPalette";
import { useAppStore } from "../store";

export default function EditGroupe(): JSX.Element {
	const navigate = useNavigate();
	const { tunnelId = "" } = useParams();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [tunnel, setTunnel] = useState<Tunnel | null>(null);
	const [name, setName] = useState("");
	const [color, setColor] = useState(DEFAULT_TUNNEL_COLOR);
	const [description, setDescription] = useState("");
	const [tunnelCount, setTunnelCount] = useState(0);
	const [scenariosInGroup, setScenariosInGroup] = useState(0);

	const load = useCallback(async () => {
		if (!activeProjectId) return;
		const tunnels = await window.api.listTunnels(activeProjectId);
		setTunnelCount(tunnels.length);
		const t = tunnels.find((x) => x.id === tunnelId) ?? null;
		setTunnel(t);
		if (t) {
			setName(t.name);
			setColor(t.color);
			setDescription(t.description);
		}
		const scs: Scenario[] =
			await window.api.listScenariosByProject(activeProjectId);
		setScenariosInGroup(scs.filter((s) => s.tunnelId === tunnelId).length);
	}, [activeProjectId, tunnelId]);
	useEffect(() => {
		load();
	}, [load]);

	const canSave = name.trim().length > 0 && !!tunnel;
	const canDelete = !!tunnel && tunnelCount > 1 && scenariosInGroup === 0;

	async function handleSave(): Promise<void> {
		if (!canSave || !tunnel) return;
		await window.api.updateTunnel({
			...tunnel,
			name: name.trim(),
			color,
			description: description.trim(),
		});
		navigate("/scenarios");
	}

	async function handleDelete(): Promise<void> {
		if (!canDelete || !tunnel) return;
		await window.api.deleteTunnel(tunnel.projectId, tunnel.id);
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
				<span>{tunnel?.name ?? "Groupe"}</span>
			</nav>
			<h1 className="otl-hub-title">Modifier le groupe</h1>
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
				<div className="otl-create__actions">
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!canSave}
						onClick={handleSave}
					>
						Enregistrer les modifications
					</button>
					<button
						type="button"
						className="otl-tab"
						onClick={() => navigate("/scenarios")}
					>
						Annuler
					</button>
					<button
						type="button"
						className="otl-btn-stop"
						disabled={!canDelete}
						title={
							canDelete
								? "Supprimer ce groupe"
								: "Déplacez ou supprimez d'abord ses scénarios"
						}
						onClick={handleDelete}
					>
						Supprimer
					</button>
				</div>
			</div>
		</div>
	);
}
