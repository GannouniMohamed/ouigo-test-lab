import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnvPicker } from "../components/EnvPicker";
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

	const [filter, setFilter] = useState<"all" | "mobile" | "web">("all");
	const [query, setQuery] = useState("");
	const [envId, setEnvId] = useState("");

	useEffect(() => {
		window.api.listScenarios().then((s) => setScenarios(s));
	}, [setScenarios]);

	async function handleLancer(
		scenarioId: string,
		defaultEnvironmentId: string,
	) {
		const env = envId || defaultEnvironmentId;
		const { runId } = await window.api.runScenario(scenarioId, env);
		navigate(`/run/${runId}`);
	}

	const visibleScenarios = scenarios.filter((s) => {
		if (filter !== "all" && s.platform !== filter) return false;
		if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
			return false;
		return true;
	});

	return (
		<div style={{ padding: "2rem" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: "1.5rem",
				}}
			>
				<h1
					style={{
						fontFamily: "var(--otl-font)",
						color: "var(--otl-text)",
						margin: 0,
						fontSize: "1.5rem",
						fontWeight: 700,
					}}
				>
					Scénarios
				</h1>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={() => navigate("/scenarios/new")}
				>
					+ Nouveau scénario
				</button>
			</div>

			<EnvPicker value={envId} onChange={setEnvId} />

			<div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
				<button
					type="button"
					className={filter === "all" ? "otl-btn-primary" : "otl-btn"}
					onClick={() => setFilter("all")}
				>
					Tous
				</button>
				<button
					type="button"
					className={filter === "mobile" ? "otl-btn-primary" : "otl-btn"}
					onClick={() => setFilter("mobile")}
				>
					Mobile
				</button>
				<button
					type="button"
					className={filter === "web" ? "otl-btn-primary" : "otl-btn"}
					onClick={() => setFilter("web")}
				>
					Web
				</button>
			</div>

			<input
				type="text"
				placeholder="Rechercher…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				style={{ marginBottom: "1rem", padding: "0.5rem", width: "100%" }}
			/>

			{visibleScenarios.length === 0 ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
						gap: "1rem",
					}}
				>
					{visibleScenarios.map((scenario) => (
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
