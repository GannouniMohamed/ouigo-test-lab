import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Report as ReportData } from "../../shared/types";

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

	const failedStep = report.steps.find(
		(s) => s.status === "failed" && s.screenshotPath,
	);

	return (
		<div className="otl-report">
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
				<ol className="otl-report__steps">
					{report.steps.map((step) => (
						<li
							key={step.index}
							className={`otl-rstep${step.status === "failed" ? " otl-rstep--failed" : ""}`}
						>
							<span
								className={`otl-rstep__icon otl-rstep__icon--${step.status}`}
							>
								{step.status === "passed" && <CheckIcon />}
								{step.status === "failed" && <XIcon size={12} />}
								{step.status === "skipped" && <DashIcon />}
							</span>
							<div className="otl-rstep__content">
								<span className="otl-rstep__title">{step.title}</span>
								{step.status === "failed" && step.error && (
									<pre className="otl-rstep__err">{step.error}</pre>
								)}
							</div>
							<code className="otl-rstep__duration">
								{formatMs(step.durationMs)}
							</code>
						</li>
					))}
				</ol>

				{/* Right panel */}
				<div className="otl-report__right">
					{/* Screenshot card */}
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

					{/* AI repair block — disabled, reserved for Phase 3 */}
					<section className="otl-ai" aria-disabled="true">
						<div className="otl-ai__header">
							<div className="otl-ai__icon-badge">
								<SparkleIcon />
							</div>
							<div className="otl-ai__title-row">
								<span className="otl-ai__title">Réparation IA</span>
								<span className="otl-ai__soon">bientôt</span>
							</div>
						</div>
						<p className="otl-ai__desc">
							L'IA analysera l'erreur et le DOM pour proposer une correction du
							scénario.
						</p>
						<div className="otl-diff">
							<div className="otl-diff__line otl-diff__line--removed">
								- getByText("Connexion")
							</div>
							<div className="otl-diff__line otl-diff__line--added">
								+ getByText("Se connecter")
							</div>
						</div>
						<div className="otl-ai__footer">
							<button
								type="button"
								className="otl-ai__btn-apply"
								disabled
								aria-disabled="true"
							>
								Appliquer
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
				</div>
			</div>
		</div>
	);
}
