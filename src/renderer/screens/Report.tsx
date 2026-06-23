import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Report as ReportData } from "../../shared/types";

function statusLabel(status: ReportData["status"]): string {
	if (status === "passed") return "Réussi";
	if (status === "failed") return "Échec";
	return "Annulé";
}

function statusClassName(status: ReportData["status"]): string {
	if (status === "passed") return "otl-report__status--passed";
	return "otl-report__status--danger";
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function stepIcon(status: "passed" | "failed" | "skipped"): string {
	if (status === "passed") return "✓";
	if (status === "failed") return "✗";
	return "–";
}

export default function Report(): JSX.Element {
	const { runId } = useParams<{ runId: string }>();
	const [report, setReport] = useState<ReportData | null>(null);

	useEffect(() => {
		if (!runId) return;
		window.api.getReport(runId).then(setReport);
	}, [runId]);

	if (!report) {
		return <div className="otl-report otl-report--loading">Chargement…</div>;
	}

	const totalSteps = report.steps.length;
	const completedSteps = report.steps.filter(
		(s) => s.status !== "skipped",
	).length;

	return (
		<div className="otl-report">
			{/* Header */}
			<header className="otl-report__header">
				<h1 className="otl-report__scenario-name">{report.scenarioName}</h1>
				<div className="otl-report__meta">
					<span className="otl-report__env">{report.environmentLabel}</span>
					<span
						className={`otl-report__status ${statusClassName(report.status)}`}
					>
						{statusLabel(report.status)}
					</span>
					<code className="otl-report__duration">
						{formatMs(report.durationMs)}
					</code>
					<span className="otl-report__steps-count">
						{completedSteps}/{totalSteps}
					</span>
				</div>
			</header>

			{/* Step list */}
			<ol className="otl-report__steps">
				{report.steps.map((step) => (
					<li
						key={step.index}
						className={`otl-report__step otl-report__step--${step.status}`}
					>
						<span className="otl-report__step-icon">
							{stepIcon(step.status)}
						</span>
						<span className="otl-report__step-title">{step.title}</span>
						<code className="otl-report__step-duration">
							{formatMs(step.durationMs)}
						</code>
						{step.status === "failed" && step.error && (
							<pre className="otl-report__step-error">{step.error}</pre>
						)}
						{step.status === "failed" && step.screenshotPath && (
							<img
								data-testid="failure-screenshot"
								src={`file://${step.screenshotPath}`}
								alt="capture d'échec"
								className="otl-report__screenshot"
							/>
						)}
					</li>
				))}
			</ol>

			{/* AI repair block — disabled, reserved for Phase 3 */}
			<section
				className="otl-report__ai-repair otl-report__ai-repair--disabled"
				aria-disabled="true"
			>
				<h2 className="otl-report__ai-repair-title">Réparation IA</h2>
				<p className="otl-report__ai-repair-placeholder">Bientôt</p>
			</section>
		</div>
	);
}
