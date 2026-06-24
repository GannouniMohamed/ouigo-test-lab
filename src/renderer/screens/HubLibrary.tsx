import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Platform, Scenario, Tunnel } from "../../shared/types";
import { EnvPicker } from "../components/EnvPicker";
import { PlatformIcon } from "../components/PlatformIcon";
import { StatusBadge } from "../components/StatusBadge";
import { formatAt, formatDuration } from "../lib/time";
import { useAppStore } from "../store";

const PLATFORM_LABELS: Record<Platform, string> = {
	web: "Web",
	responsive: "Responsive",
	mobile: "Mobile",
};

type Filter = "all" | Platform;

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
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const scenarios = useAppStore((s) => s.scenarios);
	const setScenarios = useAppStore((s) => s.setScenarios);
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);

	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [envId, setEnvId] = useState("");
	const [creatingTunnel, setCreatingTunnel] = useState(false);
	const [tunnelName, setTunnelName] = useState("");

	const reload = useCallback(async (): Promise<void> => {
		if (!activeProjectId) return;
		const [s, t] = await Promise.all([
			window.api.listScenariosByProject(activeProjectId),
			window.api.listTunnels(activeProjectId),
		]);
		setScenarios(s);
		setTunnels(t);
	}, [activeProjectId, setScenarios]);

	useEffect(() => {
		reload();
	}, [reload]);

	async function handleLancer(scenario: Scenario): Promise<void> {
		const env =
			activeEnvByProject[scenario.projectId] ||
			envId ||
			scenario.defaultEnvironmentId;
		const { runId } = await window.api.runScenario(
			scenario.projectId,
			scenario.tunnelId,
			scenario.id,
			env,
		);
		navigate(`/run/${runId}`);
	}

	async function handleCreateTunnel(): Promise<void> {
		const name = tunnelName.trim();
		if (!name || !activeProjectId) return;
		await window.api.createTunnel({ projectId: activeProjectId, name });
		setTunnelName("");
		setCreatingTunnel(false);
		await reload();
	}

	const visible = useMemo(
		() =>
			scenarios.filter((s) => {
				if (filter !== "all" && s.platform !== filter) return false;
				if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
					return false;
				return true;
			}),
		[scenarios, filter, query],
	);

	const groups = useMemo(
		() =>
			tunnels.map((t) => ({
				tunnel: t,
				items: visible.filter((s) => s.tunnelId === t.id),
			})),
		[tunnels, visible],
	);

	return (
		<div style={{ padding: "2rem" }}>
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
				<div style={{ display: "flex", gap: "0.5rem" }}>
					<button
						type="button"
						className="otl-tab"
						onClick={() => setCreatingTunnel((v) => !v)}
					>
						+ Tunnel
					</button>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={() => navigate("/scenarios/new")}
					>
						+ Nouveau scénario
					</button>
				</div>
			</div>

			{creatingTunnel && (
				<div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du tunnel"
						value={tunnelName}
						onChange={(e) => setTunnelName(e.target.value)}
					/>
					<button
						type="button"
						className="otl-btn-primary"
						onClick={handleCreateTunnel}
					>
						Créer
					</button>
				</div>
			)}

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
					{(["all", "web", "responsive", "mobile"] as Filter[]).map((f) => (
						<button
							key={f}
							type="button"
							className={filter === f ? "otl-tab otl-tab--active" : "otl-tab"}
							onClick={() => setFilter(f)}
						>
							{f === "all" ? "Tous" : PLATFORM_LABELS[f]}
						</button>
					))}
				</div>
			</div>

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

			{groups.every((g) => g.items.length === 0) ? (
				<p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>
			) : (
				groups
					.filter((g) => g.items.length > 0)
					.map((g) => (
						<section key={g.tunnel.id} className="otl-tunnel-group">
							<h2 className="otl-tunnel-group__title">
								{g.tunnel.name}
								<span className="otl-tunnel-group__count">
									{g.items.length}
								</span>
							</h2>
							<div className="otl-card-list">
								{g.items.map((scenario) => (
									<div
										key={scenario.id}
										data-testid={`scenario-card-${scenario.id}`}
										className={
											scenario.lastRun.status === "failed"
												? "otl-card otl-card--failed"
												: "otl-card"
										}
									>
										<div className="otl-card__icon">
											<PlatformIcon platform={scenario.platform} size={16} />
										</div>
										<div className="otl-card__body">
											<div className="otl-card__name">{scenario.name}</div>
											<div className="otl-card__meta">
												{PLATFORM_LABELS[scenario.platform]} ·{" "}
												{scenario.browser}
											</div>
										</div>
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
												onClick={() => handleLancer(scenario)}
											>
												Lancer
											</button>
										</div>
									</div>
								))}
							</div>
						</section>
					))
			)}
		</div>
	);
}
