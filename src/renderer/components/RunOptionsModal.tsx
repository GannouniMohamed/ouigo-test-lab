import { useState } from "react";
import type { Environment } from "../../shared/types";

interface RunOptionsModalProps {
	scenarioName: string;
	environments: Environment[];
	defaultEnvId: string;
	onCancel: () => void;
	onConfirm: (envId: string, opts: { headed: boolean }) => void;
}

export default function RunOptionsModal({
	scenarioName,
	environments,
	defaultEnvId,
	onCancel,
	onConfirm,
}: RunOptionsModalProps): JSX.Element {
	const initialEnv =
		environments.find((e) => e.id === defaultEnvId)?.id ??
		environments[0]?.id ??
		defaultEnvId;
	const [envId, setEnvId] = useState(initialEnv);
	const [headed, setHeaded] = useState(true);

	return (
		<div className="otl-modal-overlay">
			<dialog
				open
				className="otl-modal"
				aria-label={`Options d'exécution — ${scenarioName}`}
			>
				<h2 className="otl-modal__title">Lancer « {scenarioName} »</h2>

				<label className="otl-field-label" htmlFor="run-env">
					Environnement
				</label>
				<select
					id="run-env"
					className="otl-select"
					value={envId}
					onChange={(e) => setEnvId(e.target.value)}
				>
					{environments.map((env) => (
						<option key={env.id} value={env.id}>
							{env.label}
						</option>
					))}
				</select>

				<span className="otl-field-label otl-modal__group-label">
					Affichage
				</span>
				<div className="otl-modal__toggle">
					<button
						type="button"
						className={`otl-modal__toggle-btn${headed ? " otl-modal__toggle-btn--active" : ""}`}
						aria-pressed={headed}
						onClick={() => setHeaded(true)}
					>
						Visible
						<span className="otl-modal__toggle-hint">
							le navigateur s'affiche (recommandé)
						</span>
					</button>
					<button
						type="button"
						className={`otl-modal__toggle-btn${!headed ? " otl-modal__toggle-btn--active" : ""}`}
						aria-pressed={!headed}
						onClick={() => setHeaded(false)}
					>
						Invisible
						<span className="otl-modal__toggle-hint">
							plus rapide, sans fenêtre
						</span>
					</button>
				</div>

				<div className="otl-modal__actions">
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() => onConfirm(envId, { headed })}
					>
						Démarrer
					</button>
					<button type="button" className="otl-tab" onClick={onCancel}>
						Annuler
					</button>
				</div>
			</dialog>
		</div>
	);
}
