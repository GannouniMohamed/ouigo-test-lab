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
	const [headed, setHeaded] = useState(true);
	const [repeat, setRepeat] = useState(1);
	const [execution, setExecution] = useState<BatchExecutionMode>("sequential");

	// Env is inherited from the project — read-only, no user selection.
	const envLabel =
		environments.find((e) => e.id === defaultEnvId)?.label ?? "Local";

	const clampRepeat = (n: number): number =>
		Math.max(1, Math.min(MAX_REPEAT, Math.round(Number.isNaN(n) ? 1 : n)));

	const recap =
		execution === "parallel"
			? `${repeat} exécutions, 2 en parallèle`
			: `${repeat} exécutions, en séquentiel`;

	return (
		<div className="otl-modal-overlay">
			<dialog
				open
				className="otl-modal"
				aria-label={`Options d'exécution — ${scenarioName}`}
			>
				<h2 className="otl-modal__title">Lancer un scénario</h2>
				<p className="otl-modal__subtitle">{scenarioName}</p>

				<div className="otl-envbanner" role="note">
					<span className="otl-envbanner__lock" aria-hidden="true">
						🔒
					</span>
					<span>
						Environnement <strong>{envLabel}</strong> · hérité du projet
					</span>
				</div>

				<span className="otl-field-label otl-modal__group-label">
					AFFICHAGE
				</span>
				<div className="otl-modal__toggle">
					<button
						type="button"
						className={`otl-modal__toggle-btn${headed ? " otl-modal__toggle-btn--active" : ""}`}
						aria-pressed={headed}
						onClick={() => setHeaded(true)}
					>
						Visible
						<span className="otl-modal__toggle-hint">on voit l'appareil</span>
					</button>
					<button
						type="button"
						className={`otl-modal__toggle-btn${!headed ? " otl-modal__toggle-btn--active" : ""}`}
						aria-pressed={!headed}
						onClick={() => setHeaded(false)}
					>
						Invisible
						<span className="otl-modal__toggle-hint">arrière-plan</span>
					</button>
				</div>

				<span className="otl-field-label otl-modal__group-label">Répéter</span>
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
					<span className="otl-modal__repeat-hint">jusqu'à 20 exécutions</span>
				</div>

				{repeat > 1 && (
					<>
						<span className="otl-field-label otl-modal__group-label">
							MODE D'EXÉCUTION
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
									Recommandé · un run à la fois
								</span>
							</button>
							<button
								type="button"
								className={`otl-modal__toggle-btn${execution === "parallel" ? " otl-modal__toggle-btn--active" : ""}`}
								aria-pressed={execution === "parallel"}
								onClick={() => setExecution("parallel")}
							>
								Parallèle
								<span className="otl-modal__toggle-hint">2 appareils max</span>
							</button>
						</div>
						<p className="otl-modal__recap">{recap}</p>
					</>
				)}

				<div className="otl-modal__actions">
					<button type="button" className="otl-tab" onClick={onCancel}>
						Annuler
					</button>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() =>
							onConfirm(defaultEnvId, {
								headed,
								repeat: clampRepeat(repeat),
								execution,
							})
						}
					>
						▶ Démarrer
					</button>
				</div>
			</dialog>
		</div>
	);
}
