import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store";

function formatAt(at?: string): string {
	if (!at) return "—";
	return new Date(at).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDuration(ms?: number): string {
	if (ms == null) return "—";
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatPlatform(platform: "web" | "mobile"): string {
	return platform === "web" ? "Web" : "Mobile";
}

export default function HubLibrary(): JSX.Element {
	const navigate = useNavigate();
	const scenarios = useAppStore((s) => s.scenarios);
	const setScenarios = useAppStore((s) => s.setScenarios);

	useEffect(() => {
		window.api.listScenarios().then((s) => setScenarios(s));
	}, [setScenarios]);

	async function handleLancer(scenarioId: string, envId: string) {
		const { runId } = await window.api.runScenario(scenarioId, envId);
		navigate(`/run/${runId}`);
	}

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
				Scénarios
			</h1>

			{scenarios.length === 0 ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
						gap: "1rem",
					}}
				>
					{scenarios.map((scenario) => (
						<div
							key={scenario.id}
							data-testid={`scenario-card-${scenario.id}`}
							className="otl-surface"
							style={{
								padding: "1.25rem",
								display: "flex",
								flexDirection: "column",
								gap: "0.75rem",
							}}
						>
							<div
								style={{
									fontWeight: 600,
									fontSize: "1rem",
									color: "var(--otl-text)",
								}}
							>
								{scenario.name}
							</div>

							<div
								style={{
									fontSize: "0.8rem",
									color: "var(--otl-text-2)",
									display: "flex",
									gap: "0.5rem",
									alignItems: "center",
								}}
							>
								<span>{formatPlatform(scenario.platform)}</span>
								<span style={{ color: "var(--otl-text-3)" }}>·</span>
								<span>{scenario.browser}</span>
							</div>

							<StatusBadge status={scenario.lastRun.status} />

							<div style={{ fontSize: "0.75rem", color: "var(--otl-text-2)" }}>
								{formatAt(scenario.lastRun.at)}
							</div>

							<div
								style={{
									fontFamily: "var(--otl-mono)",
									fontSize: "0.75rem",
									color: "var(--otl-text-2)",
								}}
							>
								{formatDuration(scenario.lastRun.durationMs)}
							</div>

							<button
								type="button"
								className="otl-btn-primary"
								style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
								onClick={() =>
									handleLancer(scenario.id, scenario.defaultEnvironmentId)
								}
							>
								Lancer
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
