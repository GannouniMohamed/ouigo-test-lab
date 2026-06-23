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

	return (
		<div className="live-run">
			<h1>Exécution en cours</h1>
			<p>
				Temps écoulé :{" "}
				<code style={{ fontFamily: "monospace" }}>{elapsed}s</code>
			</p>
			{totalSteps > 0 && <p>Progression : {progress}%</p>}
			<ul>
				{state.steps.map((step) => (
					<li key={step.index} className={`step step--${step.status}`}>
						{step.status === "running" && (
							<span className="spinner" aria-label="running" />
						)}
						{step.status === "passed" && <span>✓ </span>}
						{step.status === "failed" && (
							<span style={{ color: "var(--color-danger, red)" }}>✗ </span>
						)}
						{step.title}
						{step.durationMs !== undefined && (
							<span className="step__duration"> ({step.durationMs}ms)</span>
						)}
						{step.error && (
							<span
								className="step__error"
								style={{ color: "var(--color-danger, red)" }}
							>
								{" "}
								— {step.error}
							</span>
						)}
					</li>
				))}
			</ul>
			{state.logs.length > 0 && (
				<pre className="live-run__logs">{state.logs.join("\n")}</pre>
			)}
			<button
				type="button"
				onClick={() => {
					if (runId) {
						window.api.cancelRun(runId);
					}
				}}
			>
				Stop
			</button>
		</div>
	);
}
