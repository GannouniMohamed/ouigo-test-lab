import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReportSummary, Scenario } from "../../shared/types";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store";

type BadgeStatus = "passed" | "failed" | "never";

function mapStatus(status: ReportSummary["status"]): BadgeStatus {
	if (status === "passed") return "passed";
	return "failed";
}

function formatAt(at: string): string {
	return new Date(at).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

export default function History(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [reports, setReports] = useState<ReportSummary[]>([]);
	const [scenarioMap, setScenarioMap] = useState<Map<string, string>>(
		new Map(),
	);

	useEffect(() => {
		Promise.all([
			window.api.listReports(),
			activeProjectId
				? window.api.listScenariosByProject(activeProjectId)
				: Promise.resolve([]),
		]).then(([reps, scenarios]: [ReportSummary[], Scenario[]]) => {
			const map = new Map<string, string>();
			for (const s of scenarios) map.set(s.id, s.name);
			setScenarioMap(map);
			setReports(reps);
		});
	}, [activeProjectId]);

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
				Rapports
			</h1>

			{reports.length === 0 ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucune exécution</p>
			) : (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "0.5rem",
					}}
				>
					{reports.map((r) => (
						<button
							key={r.runId}
							type="button"
							className="otl-surface"
							onClick={() => navigate(`/report/${r.runId}`)}
							style={{
								padding: "1rem 1.25rem",
								display: "flex",
								alignItems: "center",
								gap: "1rem",
								cursor: "pointer",
								width: "100%",
								background: "none",
								border: "none",
								textAlign: "left",
							}}
						>
							<span
								style={{ flex: 1, fontWeight: 500, color: "var(--otl-text)" }}
							>
								{scenarioMap.get(r.scenarioId) ?? r.scenarioId}
							</span>
							<StatusBadge status={mapStatus(r.status)} />
							<span style={{ fontSize: "0.8rem", color: "var(--otl-text-2)" }}>
								{formatAt(r.startedAt)}
							</span>
							<span
								style={{
									fontFamily: "var(--otl-mono)",
									fontSize: "0.8rem",
									color: "var(--otl-text-2)",
								}}
							>
								{formatDuration(r.durationMs)}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
