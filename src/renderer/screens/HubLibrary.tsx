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

function WebIcon(): JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="2" y1="12" x2="22" y2="12" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	);
}

function MobileIcon(): JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
			<line x1="12" y1="18" x2="12.01" y2="18" />
		</svg>
	);
}

function MagnifierIcon(): JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
	);
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
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					marginBottom: "1.5rem",
				}}
			>
				<div>
					<h1 className="otl-hub-title">Scénarios</h1>
					<p className="otl-hub-subtitle">
						Vos parcours de test, prêts à lancer
					</p>
				</div>
				<button
					type="button"
					className="otl-btn-primary"
					onClick={() => navigate("/scenarios/new")}
				>
					+ Nouveau scénario
				</button>
			</div>

			{/* Env picker + filter row */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.75rem",
					marginBottom: "1rem",
				}}
			>
				<EnvPicker value={envId} onChange={setEnvId} />

				<div style={{ display: "flex", gap: "0.5rem" }}>
					<button
						type="button"
						className={filter === "all" ? "otl-tab otl-tab--active" : "otl-tab"}
						onClick={() => setFilter("all")}
					>
						Tous
					</button>
					<button
						type="button"
						className={
							filter === "mobile" ? "otl-tab otl-tab--active" : "otl-tab"
						}
						onClick={() => setFilter("mobile")}
					>
						Mobile
					</button>
					<button
						type="button"
						className={filter === "web" ? "otl-tab otl-tab--active" : "otl-tab"}
						onClick={() => setFilter("web")}
					>
						Web
					</button>
				</div>
			</div>

			{/* Search */}
			<div className="otl-search" style={{ marginBottom: "1rem" }}>
				<span className="otl-search__icon">
					<MagnifierIcon />
				</span>
				<input
					type="text"
					className="otl-search__input"
					placeholder="Rechercher…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>

			{/* Scenario list */}
			{visibleScenarios.length === 0 ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>
			) : (
				<div className="otl-card-list">
					{visibleScenarios.map((scenario) => (
						<div
							key={scenario.id}
							data-testid={`scenario-card-${scenario.id}`}
							className={
								scenario.lastRun.status === "failed"
									? "otl-card otl-card--failed"
									: "otl-card"
							}
						>
							{/* Platform icon */}
							<div className="otl-card__icon">
								{scenario.platform === "web" ? <WebIcon /> : <MobileIcon />}
							</div>

							{/* Name + meta */}
							<div className="otl-card__body">
								<div className="otl-card__name">{scenario.name}</div>
								<div className="otl-card__meta">
									{formatPlatform(scenario.platform)} · {scenario.browser}
								</div>
							</div>

							{/* Right cluster */}
							<div className="otl-card__right">
								<StatusBadge status={scenario.lastRun.status} />
								<span className="otl-card__time">
									{formatAt(scenario.lastRun.at)}
								</span>
								<span className="otl-card__duration">
									{formatDuration(scenario.lastRun.durationMs)}
								</span>
								<button
									type="button"
									className="otl-btn-launch"
									onClick={() =>
										handleLancer(scenario.id, scenario.defaultEnvironmentId)
									}
								>
									Lancer
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
