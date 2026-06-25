import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { applyStepEdit, parseRecordedSteps } from "../../shared/spec";
import type {
	Report as ReportData,
	RunMode,
	StepEditOp,
	StepScope,
	StepStatus,
} from "../../shared/types";
import { stepActiveInMode } from "../../shared/types";

interface StepRow {
	index: number;
	title: string;
	status?: StepStatus;
	scope?: StepScope;
	error?: string;
	durationMs?: number;
	screenshotPath?: string;
}

function scopeChipLabel(scope: StepScope | undefined): string | null {
	if (scope === "skip") return "ignorée";
	if (scope === "visible") return "visible seulement";
	if (scope === "invisible") return "invisible seulement";
	return null;
}

function statusLabel(status: ReportData["status"]): string {
	if (status === "passed") return "Réussi";
	if (status === "failed") return "Échec";
	return "Annulé";
}

function statusModifier(status: ReportData["status"]): string {
	if (status === "passed") return "otl-report-status--passed";
	if (status === "failed") return "otl-report-status--failed";
	return "otl-report-status--cancelled";
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
	return `${totalSec}s`;
}

function basename(path: string): string {
	return path.split("/").pop() ?? path;
}

function CheckIcon(): JSX.Element {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M2 6l3 3 5-5"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function XIcon({ size = 12 }: { size?: number }): JSX.Element {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M2 2l8 8M10 2l-8 8"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function DashIcon(): JSX.Element {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M3 6h6"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function SparkleIcon(): JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M8 2l1.2 3.6L13 8l-3.8 2.4L8 14l-1.2-3.6L3 8l3.8-2.4L8 2z"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
				fill="currentColor"
				fillOpacity="0.3"
			/>
		</svg>
	);
}

function CameraIcon(): JSX.Element {
	return (
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

export default function Report(): JSX.Element {
	const { runId } = useParams<{ runId: string }>();
	const [report, setReport] = useState<ReportData | null>(null);
	// Draft step-management: edits build an in-memory draft spec (disk untouched
	// until "Enregistrer"). "Relancer" runs the draft in place. Leaving the page
	// discards the draft — the scenario stays unchanged.
	const [draft, setDraft] = useState<string | null>(null);
	const [dirty, setDirty] = useState(false);
	const [running, setRunning] = useState(false);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValue, setEditValue] = useState("");
	const [scopeMenuIndex, setScopeMenuIndex] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	// Presentational counter for the draft banner ("{N} modification(s) en
	// attente"). It tracks how many step edits were applied since the last
	// reset; it never gates the draft logic.
	const [pendingEdits, setPendingEdits] = useState(0);

	useEffect(() => {
		if (!runId) return;
		window.api.getReport(runId).then(setReport);
	}, [runId]);

	if (!report) {
		return <div className="otl-report otl-report--loading">Chargement…</div>;
	}

	const mode: RunMode = report.mode ?? "visible";
	const canEdit = Boolean(report.projectId && report.tunnelId);
	const canRelancer = canEdit && Boolean(report.environmentId);

	async function applyEdit(op: StepEditOp): Promise<void> {
		if (!report?.projectId || !report?.tunnelId) return;
		setBusy(true);
		try {
			const base =
				draft ??
				(await window.api.getScenarioSpec(
					report.projectId,
					report.tunnelId,
					report.scenarioId,
				));
			setDraft(applyStepEdit(base, op));
			setDirty(true);
			setPendingEdits((n) => n + 1);
			setEditingIndex(null);
			setScopeMenuIndex(null);
		} finally {
			setBusy(false);
		}
	}

	async function relancer(): Promise<void> {
		if (!report?.projectId || !report?.tunnelId || !report.environmentId)
			return;
		if (!draft) return;
		setRunning(true);
		const { runId: newRunId } = await window.api.runScenario(
			report.projectId,
			report.tunnelId,
			report.scenarioId,
			report.environmentId,
			{ headed: mode === "visible", specDraft: draft },
		);
		const unsub = window.api.onRunEvent(newRunId, (ev) => {
			if (ev.type === "run-finished") {
				unsub();
				window.api.getReport(newRunId).then((r) => {
					setReport(r);
					setDirty(false);
					setPendingEdits(0);
					setRunning(false);
				});
			}
		});
	}

	async function enregistrer(): Promise<void> {
		if (!report?.projectId || !report?.tunnelId || !draft) return;
		await window.api.saveScenarioSpec(
			report.projectId,
			report.tunnelId,
			report.scenarioId,
			draft,
		);
		setDraft(null);
		setDirty(false);
		setPendingEdits(0);
	}

	function annuler(): void {
		setDraft(null);
		setDirty(false);
		setPendingEdits(0);
		setEditingIndex(null);
		setScopeMenuIndex(null);
	}

	// In draft (dirty) mode show the edited steps (no run results yet); otherwise
	// the run's aligned steps.
	const rows: StepRow[] =
		dirty && draft
			? parseRecordedSteps(draft).map((s) => ({
					index: s.index,
					title: s.title,
					scope: s.scope,
				}))
			: report.steps.map((s) => ({ ...s }));

	const totalSteps = report.steps.length;
	const completedSteps = report.steps.filter(
		(s) => s.status !== "skipped",
	).length;

	const failedStep = report.steps.find(
		(s) => s.status === "failed" && s.screenshotPath,
	);

	return (
		<div className="otl-report">
			{/* Draft banner — shown while there are unsaved step edits. */}
			{dirty && (
				<div className="otl-draftbar">
					<div className="otl-draftbar__info">
						<span className="otl-draftbar__title">
							<span className="otl-draftbar__dot" aria-hidden="true">
								●
							</span>
							Brouillon non enregistré
						</span>
						<span className="otl-draftbar__count">
							{pendingEdits} modification{pendingEdits > 1 ? "s" : ""} d'étape
							{pendingEdits > 1 ? "s" : ""} en attente
						</span>
					</div>
					<div className="otl-draftbar__actions">
						<button
							type="button"
							className="otl-draftbar__btn otl-draftbar__btn--primary"
							disabled={running || !canRelancer}
							title={
								canRelancer
									? "Relancer avec les modifications"
									: "Relance indisponible pour ce rapport — relancez depuis la bibliothèque"
							}
							onClick={relancer}
						>
							{running ? "Relance en cours…" : "↻ Relancer"}
						</button>
						<button
							type="button"
							className="otl-draftbar__btn"
							disabled={running}
							onClick={enregistrer}
						>
							Enregistrer
						</button>
						<button
							type="button"
							className="otl-draftbar__btn otl-draftbar__btn--ghost"
							disabled={running}
							onClick={annuler}
						>
							Annuler
						</button>
					</div>
				</div>
			)}

			{/* Header */}
			<header className="otl-report__header">
				<div className="otl-report__header-left">
					<span
						className={`otl-report-status ${statusModifier(report.status)}`}
					>
						{report.status === "passed" && <CheckIcon />}
						{report.status === "failed" && <XIcon size={12} />}
						{statusLabel(report.status)}
					</span>
					<h1 className="otl-report__scenario-name">{report.scenarioName}</h1>
				</div>
				<div className="otl-report__meta">
					<span className="otl-report__env">{report.environmentLabel}</span>
					<span className="otl-report__mode">
						MODE {mode === "visible" ? "Visible" : "Invisible"}
					</span>
					<span className="otl-report__steps-count">
						{completedSteps}/{totalSteps} étapes
					</span>
					<span className="otl-report__duration">
						Durée{" "}
						<code className="otl-report__duration-val">
							{formatMs(report.durationMs)}
						</code>
					</span>
				</div>
			</header>

			{/* Body: left step list + right panel */}
			<div className="otl-report__body">
				{/* Step list */}
				<div className="otl-report__steps-col">
					<div className="otl-report__steps-head">
						<span className="otl-report__steps-title">
							Déroulé des étapes · édition par mode
						</span>
						{canEdit && (
							<span className="otl-report__steps-hint">
								survolez une étape pour l'éditer
							</span>
						)}
					</div>
					<ol className="otl-report__steps">
						{rows.map((step) => {
							const neutralised = !stepActiveInMode(step.scope, mode);
							const chip = scopeChipLabel(step.scope);
							return (
								<li
									key={step.index}
									className={`otl-rstep${step.status === "failed" ? " otl-rstep--failed" : ""}${neutralised ? " otl-rstep--ignored" : ""}`}
								>
									<span
										className={`otl-rstep__icon otl-rstep__icon--${neutralised ? "skipped" : (step.status ?? "edited")}`}
									>
										{!neutralised && step.status === "passed" && <CheckIcon />}
										{!neutralised && step.status === "failed" && (
											<XIcon size={12} />
										)}
										{!neutralised && step.status === "skipped" && <DashIcon />}
										{neutralised && <DashIcon />}
									</span>
									<div className="otl-rstep__content">
										{editingIndex === step.index ? (
											<div className="otl-rstep__edit">
												<input
													className="otl-input otl-rstep__edit-input"
													value={editValue}
													// biome-ignore lint/a11y/noAutofocus: focus the field the user just opened
													autoFocus
													onChange={(e) => setEditValue(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter")
															applyEdit({
																op: "edit",
																index: step.index,
																code: editValue,
															});
														if (e.key === "Escape") setEditingIndex(null);
													}}
												/>
												<button
													type="button"
													className="otl-btn-primary otl-rstep__edit-save"
													disabled={busy}
													onClick={() =>
														applyEdit({
															op: "edit",
															index: step.index,
															code: editValue,
														})
													}
												>
													OK
												</button>
												<button
													type="button"
													className="otl-tab"
													onClick={() => setEditingIndex(null)}
												>
													Annuler
												</button>
											</div>
										) : (
											<span className="otl-rstep__title">{step.title}</span>
										)}
										{step.status === "failed" && step.error && (
											<pre className="otl-rstep__err">{step.error}</pre>
										)}
									</div>
									{chip ? (
										<span className="otl-rstep__skipped-label">{chip}</span>
									) : step.status === "skipped" ? (
										<span className="otl-rstep__skipped-label">
											non atteint
										</span>
									) : (
										typeof step.durationMs === "number" && (
											<code className="otl-rstep__duration">
												{formatMs(step.durationMs)}
											</code>
										)
									)}
									{canEdit && editingIndex !== step.index && (
										<div className="otl-rstep__actions">
											{scopeMenuIndex === step.index ? (
												<div className="otl-scopemenu">
													<div className="otl-scopemenu__title">
														Ignorer cette étape…
													</div>
													<button
														type="button"
														className="otl-scopemenu__item"
														disabled={busy}
														onClick={() =>
															// Ignored in invisible ⇒ runs only in visible.
															applyEdit({
																op: "scope",
																index: step.index,
																scope: "visible",
															})
														}
													>
														En mode invisible
													</button>
													<button
														type="button"
														className="otl-scopemenu__item"
														disabled={busy}
														onClick={() =>
															// Ignored in visible ⇒ runs only in invisible.
															applyEdit({
																op: "scope",
																index: step.index,
																scope: "invisible",
															})
														}
													>
														En mode visible
													</button>
													<button
														type="button"
														className="otl-scopemenu__item"
														disabled={busy}
														onClick={() =>
															applyEdit({
																op: "scope",
																index: step.index,
																scope: "skip",
															})
														}
													>
														Partout
													</button>
													<button
														type="button"
														className="otl-scopemenu__close"
														onClick={() => setScopeMenuIndex(null)}
														aria-label="Fermer le menu"
													>
														×
													</button>
												</div>
											) : (
												<>
													{step.scope && step.scope !== "both" ? (
														<button
															type="button"
															className="otl-rstep__action"
															disabled={busy}
															onClick={() =>
																applyEdit({
																	op: "scope",
																	index: step.index,
																	scope: "both",
																})
															}
														>
															Réactiver
														</button>
													) : (
														<button
															type="button"
															className="otl-rstep__action"
															disabled={busy}
															onClick={() => setScopeMenuIndex(step.index)}
														>
															Ignorer…
														</button>
													)}
													<button
														type="button"
														className="otl-rstep__action otl-rstep__action--icon"
														disabled={busy}
														aria-label="Modifier l'étape"
														title="Modifier"
														onClick={() => {
															setEditingIndex(step.index);
															setEditValue(step.title);
														}}
													>
														✎
													</button>
													<button
														type="button"
														className="otl-rstep__action otl-rstep__action--icon otl-rstep__action--danger"
														disabled={busy}
														aria-label="Supprimer l'étape"
														title="Supprimer"
														onClick={() =>
															applyEdit({ op: "delete", index: step.index })
														}
													>
														🗑
													</button>
												</>
											)}
										</div>
									)}
								</li>
							);
						})}
					</ol>
				</div>

				{/* Right panel */}
				<div className="otl-report__right">
					{/* Screenshot card */}
					<div className="otl-shot-title">Capture au moment de l'échec</div>
					<div className="otl-shot">
						{failedStep?.screenshotPath ? (
							<>
								<img
									data-testid="failure-screenshot"
									src={`file://${failedStep.screenshotPath}`}
									alt="capture d'échec"
									className="otl-shot__img"
								/>
								<div className="otl-shot__caption">
									{basename(failedStep.screenshotPath)}
								</div>
							</>
						) : (
							<div className="otl-shot__placeholder">
								<span className="otl-shot__camera">
									<CameraIcon />
								</span>
								<span className="otl-shot__placeholder-label">
									Capture indisponible
								</span>
							</div>
						)}
					</div>

					{/* AI repair block — VISUAL ONLY (no real AI logic). Shown only
					    when there is a failed step. Buttons are inert. */}
					{failedStep && (
						<section className="otl-ai" aria-disabled="true">
							<div className="otl-ai__header">
								<div className="otl-ai__icon-badge">
									<SparkleIcon />
								</div>
								<div className="otl-ai__title-row">
									<span className="otl-ai__title">
										Réparation suggérée par l'IA
									</span>
								</div>
							</div>
							<p className="otl-ai__desc">
								Le libellé du bouton a changé. Remplacez le sélecteur pour
								retrouver l'élément cible.
							</p>
							<div className="otl-diff">
								<div className="otl-diff__line otl-diff__line--removed">
									- getByRole("button", {"{"} name: "Connexion" {"}"})
								</div>
								<div className="otl-diff__line otl-diff__line--added">
									+ getByRole("button", {"{"} name: "Se connecter" {"}"})
								</div>
							</div>
							<div className="otl-ai__footer">
								<button
									type="button"
									className="otl-ai__btn-apply"
									disabled
									aria-disabled="true"
								>
									Appliquer la correction
								</button>
								<button
									type="button"
									className="otl-ai__btn-ignore"
									disabled
									aria-disabled="true"
								>
									Ignorer
								</button>
							</div>
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
