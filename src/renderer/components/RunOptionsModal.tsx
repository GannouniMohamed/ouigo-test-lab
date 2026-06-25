import { useState } from "react";
import type { BatchExecutionMode, Environment } from "../../shared/types";

export interface RunLaunchOptions {
	headed: boolean;
	repeat: number;
	execution: BatchExecutionMode;
}

interface RunOptionsModalProps {
	scenarioName: string;
	environments: Environment[];
	defaultEnvId: string;
	onCancel: () => void;
	onConfirm: (envId: string, opts: RunLaunchOptions) => void;
}

const MAX_REPEAT = 20;

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
	const [repeat, setRepeat] = useState(1);
	const [execution, setExecution] = useState<BatchExecutionMode>("sequential");

	const clampRepeat = (n: number): number =>
		Math.max(1, Math.min(MAX_REPEAT, Math.round(Number.isNaN(n) ? 1 : n)));

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

				<span className="otl-field-label otl-modal__group-label">
					Répéter le lancement
				</span>
				<div className="otl-modal__repeat">
					<div className="otl-modal__stepper">
						<button
							type="button"
							className="otl-modal__stepper-btn"
							aria-label="Moins"
							disabled={repeat <= 1}
							onClick={() => setRepeat((r) => clampRepeat(r - 1))}
						>
							−
						</button>
						<input
							type="number"
							className="otl-modal__stepper-input"
							aria-label="Nombre de lancements"
							min={1}
							max={MAX_REPEAT}
							value={repeat}
							onChange={(e) => setRepeat(clampRepeat(e.target.valueAsNumber))}
						/>
						<button
							type="button"
							className="otl-modal__stepper-btn"
							aria-label="Plus"
							disabled={repeat >= MAX_REPEAT}
							onClick={() => setRepeat((r) => clampRepeat(r + 1))}
						>
							+
						</button>
					</div>
					<span className="otl-modal__repeat-hint">
						{repeat <= 1
							? "un seul lancement"
							: `${repeat} lancements — pour vérifier KPI & trackings`}
					</span>
				</div>

				{repeat > 1 && (
					<>
						<span className="otl-field-label otl-modal__group-label">
							Exécution
						</span>
						<div className="otl-modal__toggle">
							<button
								type="button"
								className={`otl-modal__toggle-btn${execution === "sequential" ? " otl-modal__toggle-btn--active" : ""}`}
								aria-pressed={execution === "sequential"}
								onClick={() => setExecution("sequential")}
							>
								Séquentiel
								<span className="otl-modal__toggle-hint">
									l'un après l'autre (recommandé)
								</span>
							</button>
							<button
								type="button"
								className={`otl-modal__toggle-btn${execution === "parallel" ? " otl-modal__toggle-btn--active" : ""}`}
								aria-pressed={execution === "parallel"}
								onClick={() => setExecution("parallel")}
							>
								Parallèle
								<span className="otl-modal__toggle-hint">
									2 en même temps, plus rapide
								</span>
							</button>
						</div>
					</>
				)}

				<div className="otl-modal__actions">
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() =>
							onConfirm(envId, {
								headed,
								repeat: clampRepeat(repeat),
								execution,
							})
						}
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
