import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Platform, Scenario, Tunnel } from "../../shared/types";
import { EnvPicker } from "../components/EnvPicker";
import { PlatformIcon } from "../components/PlatformIcon";
import { StatusBadge } from "../components/StatusBadge";
import { formatGroupStats } from "../lib/groupStats";
import { formatDuration, formatRelative } from "../lib/time";
import { useAppStore } from "../store";

const PLATFORM_LABELS: Record<Platform, string> = {
	web: "Web",
	responsive: "Responsive",
	mobile: "Mobile",
};

function browserLabel(b: Scenario["browser"]): string {
	if (b === "firefox") return "Firefox";
	if (b === "webkit") return "WebKit";
	return "Chromium";
}

type GroupFilter = "all" | string; // "all" or a tunnelId

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
	const firstRunScenarioId = useAppStore((s) => s.firstRunScenarioId);
	const setFirstRunScenarioId = useAppStore((s) => s.setFirstRunScenarioId);

	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
	const [query, setQuery] = useState("");
	const [envId, setEnvId] = useState("");

	const reload = useCallback(async (): Promise<void> => {
		if (!activeProjectId) return;
		const [s, t] = await Promise.all([
			window.api.listScenariosByProject(activeProjectId),
			window.api.listTunnels(activeProjectId),
		]);
		setScenarios(s);
		if (firstRunScenarioId) {
			const sc = s.find((x) => x.id === firstRunScenarioId);
			if (!sc || sc.lastRun.status !== "never") {
				setFirstRunScenarioId(null);
			}
		}
		setTunnels(t);
	}, [
		activeProjectId,
		setScenarios,
		firstRunScenarioId,
		setFirstRunScenarioId,
	]);

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

	const visible = useMemo(
		() =>
			scenarios.filter((s) => {
				if (query && !s.name.toLowerCase().includes(query.toLowerCase()))
					return false;
				return true;
			}),
		[scenarios, query],
	);

	const groups = useMemo(
		() =>
			tunnels
				.filter((t) => groupFilter === "all" || t.id === groupFilter)
				.map((t) => ({
					tunnel: t,
					items: visible.filter((s) => s.tunnelId === t.id),
				})),
		[tunnels, visible, groupFilter],
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
						className="otl-btn-primary"
						onClick={() => navigate("/scenarios/new")}
					>
						+ Nouveau scénario
					</button>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.75rem",
					marginBottom: "1rem",
				}}
			>
				<EnvPicker value={envId} onChange={setEnvId} />
				<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
					<button
						type="button"
						className={
							groupFilter === "all" ? "otl-tab otl-tab--active" : "otl-tab"
						}
						onClick={() => setGroupFilter("all")}
					>
						Tous · {visible.length}
					</button>
					{tunnels.map((t) => (
						<button
							key={t.id}
							type="button"
							className={
								groupFilter === t.id ? "otl-tab otl-tab--active" : "otl-tab"
							}
							onClick={() => setGroupFilter(t.id)}
						>
							<span
								className="otl-group-dot"
								style={{ background: t.color }}
								aria-hidden="true"
							/>
							{t.name} · {visible.filter((s) => s.tunnelId === t.id).length}
						</button>
					))}
					<button
						type="button"
						className="otl-tab"
						aria-label="Nouveau groupe"
						onClick={() => navigate("/scenarios/groups/new")}
					>
						+
					</button>
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

			{(() => {
				// When "all" is selected: hide empty groups, show global placeholder if none have items.
				// When a specific group is selected: always render its section (even if empty).
				const sectionsToRender =
					groupFilter === "all"
						? groups.filter((g) => g.items.length > 0)
						: groups;

				if (groupFilter === "all" && sectionsToRender.length === 0) {
					return <p style={{ color: "var(--otl-text-2)" }}>Aucun scénario</p>;
				}

				return sectionsToRender.map((g) => (
					<section key={g.tunnel.id} className="otl-tunnel-group">
						<h2 className="otl-tunnel-group__title">
							<span
								className="otl-group-dot"
								style={{ background: g.tunnel.color }}
								aria-hidden="true"
							/>
							{g.tunnel.name}
							<span className="otl-tunnel-group__count">{g.items.length}</span>
							{formatGroupStats(g.items) && (
								<span className="otl-group-stats">
									{formatGroupStats(g.items)}
								</span>
							)}
							<button
								type="button"
								className="otl-tunnel-group__edit"
								onClick={() =>
									navigate(`/scenarios/groups/${g.tunnel.id}/edit`)
								}
							>
								Éditer
							</button>
						</h2>
						{g.items.length === 0 ? (
							<p className="otl-empty-hint">Aucun scénario dans ce groupe.</p>
						) : (
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
												{browserLabel(scenario.browser)}
												{scenario.lastRun.stepCount != null
													? ` · ${scenario.lastRun.stepCount} étapes`
													: ""}
											</div>
										</div>
										<div className="otl-card__right">
											{firstRunScenarioId === scenario.id ? (
												<>
													<span className="otl-badge otl-badge--new">
														<span className="otl-badge__dot" />
														<span className="otl-badge__label">Nouveau</span>
													</span>
													<span className="otl-card__firstrun">
														1ʳᵉ exécution…
													</span>
												</>
											) : (
												<>
													<StatusBadge status={scenario.lastRun.status} />
													<span className="otl-card__time">
														{formatRelative(scenario.lastRun.at)}
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
												</>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				));
			})()}
		</div>
	);
}
