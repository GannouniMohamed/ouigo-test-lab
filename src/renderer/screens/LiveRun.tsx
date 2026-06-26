import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { RunEvent } from "../../shared/types";
import { humanizeStep } from "../lib/humanizeStep";

type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

interface LiveStep {
	index: number;
	title: string;
	status: StepStatus;
	durationMs?: number;
	error?: string;
}

interface LiveState {
	steps: LiveStep[];
	logs: string[];
	finished: boolean;
	runId: string | null;
}

function CheckIcon(): JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="7" cy="7" r="7" fill="rgba(0,201,177,0.18)" />
			<path
				d="M4 7l2 2 4-4"
				stroke="var(--otl-cyan)"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CrossIcon(): JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="7" cy="7" r="7" fill="rgba(255,51,102,0.18)" />
			<path
				d="M5 5l4 4M9 5l-4 4"
				stroke="var(--otl-danger)"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function SpinRing(): JSX.Element {
	return (
		<span className="otl-step__spin" aria-label="running">
			<svg
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
				aria-hidden="true"
			>
				<circle
					cx="8"
					cy="8"
					r="6"
					stroke="rgba(255,255,255,0.12)"
					strokeWidth="2"
				/>
				<path
					d="M8 2a6 6 0 0 1 6 6"
					stroke="var(--otl-ok)"
					strokeWidth="2"
					strokeLinecap="round"
				/>
			</svg>
		</span>
	);
}

function formatElapsed(secs: number): string {
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

export default function LiveRun(): JSX.Element {
	const { runId } = useParams<{ runId: string }>();
	const navigate = useNavigate();
	const navState =
		(useLocation().state as { auto?: boolean; steps?: string[] } | null) ??
		null;
	const auto = navState?.auto ?? false;

	// Seed the full parcours from the plan passed at launch (navigation state),
	// so the journey is visible immediately. The run-started event also carries
	// the plan, but it is emitted before this screen subscribes (the runId is
	// only known to the renderer after the run has started), so navigation state
	// is the reliable source. Live step events then light the rows up.
	const [state, setState] = useState<LiveState>(() => ({
		steps: (navState?.steps ?? []).map((title, index) => ({
			index,
			title,
			status: "pending" as const,
		})),
		logs: [],
		finished: false,
		runId: null,
	}));
	const [elapsed, setElapsed] = useState(0);
	const finishedRef = useRef(false);

	// Elapsed timer
	useEffect(() => {
		const interval = setInterval(() => {
			if (!finishedRef.current) {
				setElapsed((prev) => prev + 1);
			}
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Subscribe to run events
	useEffect(() => {
		if (!runId) return;
		let cancelled = false;

		const handle = (event: RunEvent) => {
			if (event.type === "run-started") {
				// Seed the full parcours from the plan (each row "non atteint")
				// so the complete journey is visible from the start. When the plan
				// is absent (fallback), keep behaving as before.
				const plan = event.steps;
				setState((prev) => ({
					...prev,
					runId: event.runId,
					steps:
						plan && plan.length > 0
							? plan.map((title, index) => ({
									index,
									title,
									status: "pending" as const,
								}))
							: prev.steps,
				}));
			} else if (event.type === "step-started") {
				setState((prev) => ({
					...prev,
					steps: [
						...prev.steps.filter((s) => s.index !== event.index),
						{
							index: event.index,
							title: event.title,
							status: "running" as const,
						},
					].sort((a, b) => a.index - b.index),
				}));
			} else if (event.type === "step-passed") {
				setState((prev) => ({
					...prev,
					steps: prev.steps.map((s) =>
						s.index === event.index
							? { ...s, status: "passed", durationMs: event.durationMs }
							: s,
					),
				}));
			} else if (event.type === "step-failed") {
				setState((prev) => ({
					...prev,
					steps: prev.steps.map((s) =>
						s.index === event.index
							? { ...s, status: "failed", error: event.error }
							: s,
					),
				}));
			} else if (event.type === "step-skipped") {
				setState((prev) => ({
					...prev,
					steps: [
						...prev.steps.filter((s) => s.index !== event.index),
						{
							index: event.index,
							title: event.title,
							status: "skipped" as const,
						},
					].sort((a, b) => a.index - b.index),
				}));
			} else if (event.type === "log") {
				setState((prev) => ({
					...prev,
					logs: [...prev.logs, event.line],
				}));
			} else if (event.type === "run-finished") {
				finishedRef.current = true;
				setState((prev) => ({ ...prev, finished: true }));
				navigate(`/report/${runId}`);
			}
		};

		const unsub = window.api.onRunEvent(runId, handle);

		// Terminal fallback for the guard-path / instant-finish race: a run can
		// finish (emitting run-started + run-finished) before this screen
		// subscribes, so those events are lost and the live view would hang.
		// We subscribe FIRST, then probe the persisted report — saveReport always
		// precedes the run-finished emit, so if the run already finished the report
		// exists and we jump straight to it; otherwise getReport rejects (no report
		// yet) and we keep relying on the streamed events.
		window.api
			.getReport?.(runId)
			?.then((report) => {
				if (cancelled || finishedRef.current || !report) return;
				finishedRef.current = true;
				navigate(`/report/${runId}`);
			})
			.catch(() => {
				/* report not persisted yet — run still in progress */
			});

		return () => {
			cancelled = true;
			unsub();
		};
	}, [runId, navigate]);

	// Y = plan length (total steps), X = steps started-or-finished.
	const totalSteps = state.steps.length;
	const startedOrDone = state.steps.filter(
		(s) =>
			s.status === "running" || s.status === "passed" || s.status === "failed",
	).length;
	const doneSteps = state.steps.filter(
		(s) => s.status === "passed" || s.status === "failed",
	).length;
	const progress =
		totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

	const runningStep = state.steps.find((s) => s.status === "running");
	// Current step title: the running step, else the last step that ran (passed
	// or failed). A still-pending plan row is not "current".
	const lastRan = state.steps
		.filter((s) => s.status === "passed" || s.status === "failed")
		.at(-1);
	const currentTitle = runningStep?.title ?? lastRan?.title ?? "";

	const title = auto
		? "Première exécution — validation automatique"
		: "Exécution en cours";

	const stepsToShow = state.steps;

	return (
		<div className="live-run">
			{/* Header row */}
			<div className="live-run__header">
				<div className="live-run__header-left">
					{auto && <span className="otl-auto-pill">AUTO</span>}
					<div className="live-run__heading">
						<h1 className="live-run__title">{title}</h1>
						{auto && (
							<p className="live-run__subtitle">
								Le scénario est lancé une fois pour vérifier qu'il fonctionne.
								Aucune action requise — vous pouvez observer le déroulé en
								direct.
							</p>
						)}
					</div>
				</div>
				<div className="live-run__header-right">
					<div className="live-run__elapsed">
						<span className="otl-label">Temps écoulé</span>
						<span className="live-run__elapsed-value">
							{formatElapsed(elapsed)}
						</span>
					</div>
					<button
						type="button"
						className="otl-btn-stop"
						onClick={() => {
							if (runId) {
								window.api.cancelRun(runId);
							}
						}}
					>
						<span aria-hidden="true">■</span> Arrêter
					</button>
				</div>
			</div>

			{/* Progress block */}
			<div className="live-run__progress-block">
				<div className="live-run__progress-line">
					<span>
						Étape <strong>{startedOrDone}</strong> sur {totalSteps}
						{currentTitle && ` · ${humanizeStep(currentTitle)}`}
					</span>
					<span className="live-run__progress-pct">{progress} %</span>
				</div>
				<div className="otl-progress">
					<div
						className="otl-progress__fill"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Main content: preview + step list */}
			<div className="live-run__body">
				{/* Left preview panel */}
				<div className="live-run__col">
					<span className="otl-label">Aperçu live</span>
					<div className="otl-preview">
						<div className="otl-preview__inner">
							<span className="otl-preview__ring" aria-hidden="true" />
							<span className="otl-preview__caption">APERÇU LIVE</span>
							<span className="otl-preview__subcaption">
								Aperçu du navigateur
							</span>
						</div>
						<span className="otl-preview__live">
							<span className="otl-preview__live-dot" />
							Capture en direct
						</span>
					</div>
				</div>

				{/* Right step list */}
				<div className="live-run__col live-run__col--steps">
					<span className="otl-label">Étapes du parcours</span>
					<div className="otl-steps">
						{stepsToShow.map((step) => {
							const modClass =
								step.status === "running"
									? "otl-step--running"
									: step.status === "passed"
										? "otl-step--done"
										: step.status === "skipped" || step.status === "pending"
											? "otl-step--skipped"
											: "otl-step--done otl-step--failed";
							return (
								<div key={step.index} className={`otl-step ${modClass}`}>
									<span className="otl-step__icon">
										{step.status === "running" && <SpinRing />}
										{step.status === "passed" && <CheckIcon />}
										{step.status === "failed" && <CrossIcon />}
										{(step.status === "skipped" ||
											step.status === "pending") && <span aria-hidden>○</span>}
									</span>
									<span className="otl-step__title">
										{humanizeStep(step.title)}
									</span>
									{step.status === "running" && (
										<span className="otl-step__running-label">en cours…</span>
									)}
									{(step.status === "skipped" || step.status === "pending") && (
										<span className="otl-step__skipped-label">non atteint</span>
									)}
									{(step.status === "passed" || step.status === "failed") &&
										step.durationMs !== undefined && (
											<span className="otl-step__duration">
												{formatDuration(step.durationMs)}
											</span>
										)}
									{step.error && (
										<span className="otl-step__error"> — {step.error}</span>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{state.logs.length > 0 && (
				<pre className="live-run__logs">{state.logs.join("\n")}</pre>
			)}
		</div>
	);
}
