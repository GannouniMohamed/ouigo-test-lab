import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { RunEvent } from "../../shared/types";

type StepStatus = "running" | "passed" | "failed";

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

function ClockIcon(): JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
			<path
				d="M7 4.5V7l1.5 1.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
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
	if (m > 0) {
		return `${m}m ${s.toString().padStart(2, "0")}s`;
	}
	return `${s}s`;
}

export default function LiveRun(): JSX.Element {
	const { runId } = useParams<{ runId: string }>();
	const navigate = useNavigate();

	const [state, setState] = useState<LiveState>({
		steps: [],
		logs: [],
		finished: false,
		runId: null,
	});
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

		const handle = (event: RunEvent) => {
			if (event.type === "run-started") {
				setState((prev) => ({ ...prev, runId: event.runId }));
			} else if (event.type === "step-started") {
				setState((prev) => ({
					...prev,
					steps: [
						...prev.steps.filter((s) => s.index !== event.index),
						{ index: event.index, title: event.title, status: "running" },
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
		return () => {
			unsub();
		};
	}, [runId, navigate]);

	const doneSteps = state.steps.filter(
		(s) => s.status === "passed" || s.status === "failed",
	).length;
	const totalSteps = state.steps.length;
	const progress =
		totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

	// Build a list of all steps (pending ones are inferred as steps not yet started)
	// For the pending display, we only show steps that have been received
	const stepsToShow = state.steps;

	return (
		<div className="live-run">
			{/* Header row */}
			<div className="live-run__header">
				<div className="live-run__header-left">
					<span className="otl-run-status">
						<span className="otl-run-status__dot" />
						En cours
					</span>
					<h1 className="live-run__title">Exécution en cours</h1>
				</div>
				<div className="live-run__header-right">
					<span className="live-run__timer">
						<ClockIcon />
						<span
							style={{
								fontFamily: "var(--otl-mono)",
								fontSize: "13px",
								color: "var(--otl-text-2)",
							}}
						>
							{formatElapsed(elapsed)}
						</span>
					</span>
					<button
						type="button"
						className="otl-btn-stop"
						onClick={() => {
							if (runId) {
								window.api.cancelRun(runId);
							}
						}}
					>
						Stop
					</button>
				</div>
			</div>

			{/* Progress bar */}
			<div className="otl-progress">
				<div className="otl-progress__fill" style={{ width: `${progress}%` }} />
			</div>

			{/* Main content: preview + step list */}
			<div className="live-run__body">
				{/* Left preview panel */}
				<div className="otl-preview">
					<div className="otl-preview__chrome">
						<span className="otl-preview__dot" />
						<span className="otl-preview__dot" />
						<span className="otl-preview__dot" />
					</div>
					<div className="otl-preview__inner">
						<span className="otl-preview__spinner" aria-hidden="true" />
					</div>
				</div>

				{/* Right step list */}
				<div className="otl-steps">
					{stepsToShow.map((step) => {
						const modClass =
							step.status === "running"
								? "otl-step--running"
								: step.status === "passed"
									? "otl-step--done"
									: "otl-step--done otl-step--failed";
						return (
							<div key={step.index} className={`otl-step ${modClass}`}>
								<span className="otl-step__icon">
									{step.status === "running" && <SpinRing />}
									{step.status === "passed" && <CheckIcon />}
									{step.status === "failed" && <CrossIcon />}
								</span>
								<span className="otl-step__title">{step.title}</span>
								{step.durationMs !== undefined && (
									<span className="otl-step__duration">
										{step.durationMs}ms
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

			{state.logs.length > 0 && (
				<pre className="live-run__logs">{state.logs.join("\n")}</pre>
			)}
		</div>
	);
}
