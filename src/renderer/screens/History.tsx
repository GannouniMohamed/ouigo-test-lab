import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BatchReport, ReportSummary, Scenario } from "../../shared/types";
import { StatusBadge } from "../components/StatusBadge";
import { type HistoryGroup, groupReports } from "../lib/groupReports";
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

function scenarioLabel(map: Map<string, string>, scenarioId: string): string {
	return map.get(scenarioId) ?? scenarioId;
}

function Sparkline({ runs }: { runs: ReportSummary[] }): JSX.Element {
	const max = Math.max(1, ...runs.map((r) => r.durationMs));
	return (
		<span className="otl-spark" aria-hidden="true">
			{runs.map((r) => {
				const pct = Math.max(8, Math.round((r.durationMs / max) * 100));
				return (
					<span
						key={r.runId}
						className={`otl-spark__bar ${
							r.status === "passed"
								? "otl-spark__bar--ok"
								: "otl-spark__bar--fail"
						}`}
						style={{ height: `${pct}%` }}
					/>
				);
			})}
		</span>
	);
}

function SingleRow({
	report,
	scenarioMap,
	onOpen,
}: {
	report: ReportSummary;
	scenarioMap: Map<string, string>;
	onOpen: (runId: string) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			className="otl-histrow"
			onClick={() => onOpen(report.runId)}
		>
			<span className="otl-histrow__name">
				{scenarioLabel(scenarioMap, report.scenarioId)}
			</span>
			<span className="otl-histrow__tag">Exécution simple</span>
			<StatusBadge status={mapStatus(report.status)} />
			<span className="otl-histrow__date">{formatAt(report.startedAt)}</span>
			<span className="otl-histrow__dur">
				{formatDuration(report.durationMs)}
			</span>
		</button>
	);
}

function BatchBlock({
	group,
	scenarioMap,
	onOpen,
}: {
	group: Extract<HistoryGroup, { kind: "batch" }>;
	scenarioMap: Map<string, string>;
	onOpen: (runId: string) => void;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const [meta, setMeta] = useState<BatchReport | null>(null);
	const first = group.runs[0];
	const name = first
		? scenarioLabel(scenarioMap, first.scenarioId)
		: group.batchId;

	useEffect(() => {
		let cancelled = false;
		// Optional enrichment — never block rendering, degrade gracefully on error.
		window.api
			?.getBatch?.(group.batchId)
			.then((b) => {
				if (!cancelled) setMeta(b);
			})
			.catch(() => {
				/* ignore: chips are best-effort */
			});
		return () => {
			cancelled = true;
		};
	}, [group.batchId]);

	const chips: string[] = [];
	if (meta) {
		chips.push(meta.execution === "parallel" ? "Parallèle" : "Séquentiel");
		chips.push(meta.mode === "invisible" ? "Invisible" : "Visible");
		if (meta.environmentLabel) chips.push(meta.environmentLabel);
	}

	return (
		<div className="otl-histgroup">
			<button
				type="button"
				className="otl-histgroup__header"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<span
					className={`otl-histgroup__chevron ${
						open ? "otl-histgroup__chevron--open" : ""
					}`}
					aria-hidden="true"
				>
					›
				</span>
				<span className="otl-histgroup__name">{name}</span>
				<span className="otl-histgroup__lot">
					LOT · {group.stats.total} runs
				</span>
				{chips.map((c) => (
					<span key={c} className="otl-histgroup__chip">
						{c}
					</span>
				))}
				<span className="otl-histgroup__date">
					{first ? formatAt(first.startedAt) : ""}
				</span>
				<Sparkline runs={group.runs} />
				<span className="otl-histgroup__ratio">
					{group.stats.passed}/{group.stats.total}
				</span>
				<span className="otl-histgroup__stats">
					{formatDuration(group.stats.min)} · {formatDuration(group.stats.avg)}{" "}
					· {formatDuration(group.stats.max)}
				</span>
			</button>

			{open && (
				<div className="otl-histgroup__runs">
					{group.runs.map((run, i) => (
						<div key={run.runId} className="otl-histgroup__run">
							<span className="otl-histgroup__run-label">Run #{i + 1}</span>
							<span
								className={`otl-histgroup__run-status ${
									run.status === "passed"
										? "otl-histgroup__run-status--ok"
										: "otl-histgroup__run-status--fail"
								}`}
							>
								{run.status === "passed" ? "Réussi" : "Échec"}
							</span>
							<span className="otl-histgroup__run-dur">
								{formatDuration(run.durationMs)}
							</span>
							<button
								type="button"
								className="otl-histgroup__detail"
								onClick={() => onOpen(run.runId)}
							>
								Voir le détail
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function History(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const activeEnv = useAppStore(
		(s) => s.activeEnvByProject[s.activeProjectId] ?? "",
	);
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

	// Filter to the active project (and, when an env is actively selected, that
	// env) before grouping so batches and singles stay consistent. Reports
	// persisted before projectId existed fall back to scenario membership: the
	// scenarioMap only holds the active project's scenarios.
	const visibleReports = useMemo(() => {
		return reports.filter((r) => {
			const belongsToProject =
				r.projectId !== undefined
					? r.projectId === activeProjectId
					: scenarioMap.has(r.scenarioId);
			if (!belongsToProject) return false;
			if (activeEnv && r.environmentId !== activeEnv) return false;
			return true;
		});
	}, [reports, scenarioMap, activeProjectId, activeEnv]);

	const groups = useMemo(() => groupReports(visibleReports), [visibleReports]);
	const open = (runId: string) => navigate(`/report/${runId}`);

	return (
		<div className="otl-hist">
			<div className="otl-hist__head">
				<div>
					<h1 className="otl-hist__title">Historique des exécutions</h1>
					<p className="otl-hist__subtitle">
						Les lots sont regroupés ; les exécutions simples apparaissent en
						ligne.
					</p>
				</div>
				<button type="button" className="otl-hist__filter">
					Filtrer
				</button>
			</div>

			{visibleReports.length === 0 ? (
				<p className="otl-hist__empty">Aucune exécution</p>
			) : (
				<div className="otl-hist__list">
					{groups.map((g) =>
						g.kind === "single" ? (
							<SingleRow
								key={g.report.runId}
								report={g.report}
								scenarioMap={scenarioMap}
								onOpen={open}
							/>
						) : (
							<BatchBlock
								key={g.batchId}
								group={g}
								scenarioMap={scenarioMap}
								onOpen={open}
							/>
						),
					)}
				</div>
			)}
		</div>
	);
}
