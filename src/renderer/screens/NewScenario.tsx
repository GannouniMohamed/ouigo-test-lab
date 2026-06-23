import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnvPicker } from "../components/EnvPicker";

export default function NewScenario(): JSX.Element {
	const navigate = useNavigate();

	const [name, setName] = useState("");
	const [envId, setEnvId] = useState("");
	const [recordingId, setRecordingId] = useState<string | null>(null);

	async function handleStart() {
		const { recordingId: id } = await window.api.startRecording({
			name,
			browser: "chromium",
			environmentId: envId || "local",
		});
		setRecordingId(id);
	}

	async function handleStop() {
		if (!recordingId) return;
		await window.api.stopRecording(recordingId);
		navigate("/scenarios");
	}

	return (
		<div style={{ padding: "2rem" }}>
			<h1
				style={{
					fontFamily: "var(--otl-font)",
					color: "var(--otl-text)",
					marginBottom: "1.5rem",
					fontSize: "1.5rem",
					fontWeight: 700,
				}}
			>
				Nouveau scénario
			</h1>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "1rem",
					maxWidth: "480px",
				}}
			>
				<input
					type="text"
					placeholder="Nom du scénario"
					value={name}
					onChange={(e) => setName(e.target.value)}
					style={{ padding: "0.5rem", width: "100%" }}
				/>

				<div style={{ display: "flex", gap: "0.5rem" }}>
					<button type="button" className="otl-btn-primary" onClick={() => {}}>
						Web
					</button>
					<button type="button" className="otl-btn" disabled title="bientôt">
						Mobile (bientôt)
					</button>
				</div>

				<EnvPicker value={envId} onChange={setEnvId} />

				{!recordingId ? (
					<button
						type="button"
						className="otl-btn-primary"
						disabled={!name.trim()}
						onClick={handleStart}
					>
						Démarrer l'enregistrement
					</button>
				) : (
					<div
						style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
					>
						<p style={{ color: "var(--otl-cyan)", fontWeight: 600 }}>
							Enregistrement en cours…
						</p>
						<button
							type="button"
							className="otl-btn-primary"
							onClick={handleStop}
						>
							Arrêter l'enregistrement
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
