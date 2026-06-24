import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Platform, Tunnel } from "../../shared/types";
import { EnvPicker } from "../components/EnvPicker";
import { useAppStore } from "../store";

export default function NewScenario(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);

	const [name, setName] = useState("");
	const [envId, setEnvId] = useState("");
	const [recordingId, setRecordingId] = useState<string | null>(null);
	const [platform, setPlatform] = useState<Platform>("web");
	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [tunnelId, setTunnelId] = useState("");

	useEffect(() => {
		if (!activeProjectId) return;
		window.api.listTunnels(activeProjectId).then((t) => {
			setTunnels(t);
			setTunnelId((current) => current || t[0]?.id || "");
		});
	}, [activeProjectId]);

	async function handleStart() {
		const { recordingId: id } = await window.api.startRecording({
			name,
			browser: "chromium",
			environmentId: envId || "local",
			projectId: activeProjectId,
			tunnelId: tunnelId || "general",
		});
		setRecordingId(id);
	}

	async function handleStop() {
		if (!recordingId) return;
		await window.api.stopRecording(recordingId);
		navigate("/scenarios");
	}

	return (
		<div className="ns-page">
			<h1 className="otl-hub-title">Nouveau scénario</h1>
			<p className="otl-hub-subtitle">
				Enregistrez un parcours — aucun code à écrire.
			</p>

			<div className="ns-form">
				{/* Platform selector */}
				<div className="ns-platforms">
					{/* Web card */}
					<button
						type="button"
						className={`otl-platform${platform === "web" ? " otl-platform--selected" : ""}`}
						onClick={() => setPlatform("web")}
					>
						<span className="otl-platform__icon">
							{/* Globe SVG */}
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" />
								<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Web</span>
							<span className="otl-platform__sub">Playwright</span>
						</span>
						<span className="otl-platform__check">
							{platform === "web" ? (
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="var(--otl-cyan)"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<path
										d="M8 12l3 3 5-5"
										stroke="#fff"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							) : (
								<span className="otl-platform__hollow-circle" />
							)}
						</span>
					</button>

					{/* Responsive card */}
					<button
						type="button"
						className={`otl-platform${platform === "responsive" ? " otl-platform--selected" : ""}`}
						onClick={() => setPlatform("responsive")}
					>
						<span className="otl-platform__icon">
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<rect x="3" y="4" width="18" height="12" rx="1.5" />
								<path d="M9 20h6M12 16v4" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Responsive</span>
							<span className="otl-platform__sub">Playwright</span>
						</span>
						<span className="otl-platform__check">
							{platform === "responsive" ? (
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="var(--otl-cyan)"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<path
										d="M8 12l3 3 5-5"
										stroke="#fff"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							) : (
								<span className="otl-platform__hollow-circle" />
							)}
						</span>
					</button>

					{/* Mobile card — disabled */}
					<div
						className="otl-platform otl-platform--disabled"
						aria-disabled="true"
						title="Bientôt"
					>
						<span className="otl-platform__icon">
							{/* Phone SVG */}
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
								<line x1="12" y1="18" x2="12.01" y2="18" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Mobile</span>
							<span className="otl-platform__sub">Maestro</span>
						</span>
						<span className="otl-platform__check">
							<span className="otl-platform__soon-pill">bientôt</span>
						</span>
					</div>
				</div>

				{/* Tunnel */}
				<div>
					<div className="otl-field-label">Tunnel</div>
					<select
						className="otl-select"
						aria-label="Tunnel"
						value={tunnelId}
						onChange={(e) => setTunnelId(e.target.value)}
					>
						{tunnels.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</div>

				{/* Scenario name */}
				<div>
					<div className="otl-field-label">Nom du scénario</div>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du scénario"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				{/* Environment */}
				<div>
					<div className="otl-field-label">Environnement</div>
					<EnvPicker value={envId} onChange={setEnvId} />
				</div>

				{/* Recording method block */}
				<div className="otl-method otl-method--rec">
					<div className="otl-method__header">
						<span className="otl-method__icon-badge">
							{/* Record dot SVG */}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="var(--otl-danger)"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" />
							</svg>
						</span>
						<div>
							<div className="otl-method__title">Enregistrer en naviguant</div>
							<div className="otl-method__desc">
								Naviguez dans le navigateur, les actions sont capturées
								automatiquement.
							</div>
						</div>
					</div>

					{!recordingId ? (
						<button
							type="button"
							className="otl-btn-primary otl-method__btn"
							disabled={!name.trim()}
							onClick={handleStart}
						>
							Démarrer l'enregistrement
						</button>
					) : (
						<div className="otl-method__recording">
							<div className="otl-recording-indicator">
								<span className="otl-recording-indicator__dot" />
								Enregistrement en cours…
							</div>
							<button
								type="button"
								className="otl-btn-stop otl-method__btn"
								onClick={handleStop}
							>
								Arrêter l'enregistrement
							</button>
						</div>
					)}
				</div>

				{/* AI method block — disabled, V3 */}
				<div className="otl-method otl-method--ai" aria-disabled="true">
					<div className="otl-method__header">
						<span className="otl-method__icon-badge otl-method__icon-badge--ai">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="var(--otl-blue)"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
							</svg>
						</span>
						<div className="otl-method__title-row">
							<span className="otl-method__title">Décrire avec l'IA</span>
							<span className="otl-ai__soon">IA · bientôt</span>
						</div>
					</div>
					<div className="otl-method__ai-placeholder">
						Ex : Tester la connexion puis l'accès au profil.
					</div>
				</div>
			</div>
		</div>
	);
}
