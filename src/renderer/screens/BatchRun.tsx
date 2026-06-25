import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	type BatchItem,
	type BatchReport,
	summarizeBatch,
} from "../../shared/types";
import { formatDuration } from "../lib/time";

function statusLabel(status: BatchItem["status"]): string {
	switch (status) {
		case "passed":
			return "Réussi";
		case "failed":
			return "Échec";
		case "running":
			return "En cours";
		case "cancelled":
			return "Annulé";
		default:
			return "En attente";
	}
}

export default function BatchRun(): JSX.Element {
	const { batchId } = useParams<{ batchId: string }>();
	const navigate = useNavigate();
	const [batch, setBatch] = useState<BatchReport | null>(null);

	// Load the persisted snapshot up front (recovers any live events that fired
	// before this screen subscribed), then refine it from live batch events.
	useEffect(() => {
		if (!batchId) return;
		let active = true;
		window.api.getBatch(batchId).then((b) => {
			if (active) setBatch(b);
		});

		const unsub = window.api.onBatchEvent(batchId, (ev) => {
			setBatch((prev) => {
				if (!prev) return prev;
				if (ev.type === "item-started") {
					return {
						...prev,
						items: prev.items.map((it) =>
							it.index === ev.index
								? { ...it, status: "running", runId: ev.runId }
								: it,
						),
					};
				}
				if (ev.type === "item-finished") {
					return {
						...prev,
						items: prev.items.map((it) =>
							it.index === ev.index
								? {
										...it,
										status: ev.status,
										runId: ev.runId,
										durationMs: ev.durationMs,
									}
								: it,
						),
					};
				}
				if (ev.type === "batch-finished") {
					// Pull the final persisted snapshot for finishedAt + any gaps.
					window.api.getBatch(prev.batchId).then((b) => setBatch(b));
				}
				return prev;
			});
		});
		return () => {
			active = false;
			unsub();
		};
	}, [batchId]);

	if (!batch) {
		return (
			<div style={{ padding: "2rem" }}>
				<p style={{ color: "var(--otl-text-2)" }}>Chargement du lot…</p>
			</div>
		);
	}

	const stats = summarizeBatch(batch.items);
	const finished = batch.finishedAt != null || stats.done === stats.total;
	const progress =
		stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

	return (
		<div className="otl-batch" style={{ padding: "2rem" }}>
			<div className="otl-batch__header">
				<div>
					<h1 className="otl-hub-title">{batch.scenarioName}</h1>
					<p className="otl-hub-subtitle">
						Lot de {batch.total} lancements ·{" "}
						{batch.execution === "parallel"
							? "Parallèle (2 max)"
							: "Séquentiel"}{" "}
						· {batch.mode === "visible" ? "Visible" : "Invisible"} ·{" "}
						{batch.environmentLabel}
					</p>
				</div>
				<span
					className={`otl-run-status${finished ? " otl-run-status--done" : ""}`}
				>
					<span className="otl-run-status__dot" />
					{finished ? "Terminé" : "En cours"}
				</span>
			</div>

			<div className="otl-progress" style={{ marginBottom: "1.25rem" }}>
				<div className="otl-progress__fill" style={{ width: `${progress}%` }} />
			</div>

			{/* KPI summary band */}
			<div className="otl-batch__summary">
				<div className="otl-batch__kpi">
					<span className="otl-batch__kpi-value">
						{stats.passed}/{stats.total}
					</span>
					<span className="otl-batch__kpi-label">réussis</span>
				</div>
				<div className="otl-batch__kpi">
					<span
						className={`otl-batch__kpi-value${stats.failed > 0 ? " otl-batch__kpi-value--bad" : ""}`}
					>
						{stats.failed}
					</span>
					<span className="otl-batch__kpi-label">échecs</span>
				</div>
				<div className="otl-batch__kpi">
					<span className="otl-batch__kpi-value otl-mono">
						{formatDuration(stats.minMs)}
					</span>
					<span className="otl-batch__kpi-label">durée min</span>
				</div>
				<div className="otl-batch__kpi">
					<span className="otl-batch__kpi-value otl-mono">
						{formatDuration(stats.avgMs)}
					</span>
					<span className="otl-batch__kpi-label">durée moyenne</span>
				</div>
				<div className="otl-batch__kpi">
					<span className="otl-batch__kpi-value otl-mono">
						{formatDuration(stats.maxMs)}
					</span>
					<span className="otl-batch__kpi-label">durée max</span>
				</div>
			</div>

			{/* Per-iteration cards */}
			<div className="otl-batch__grid">
				{batch.items.map((item) => (
					<div
						key={item.index}
						className={`otl-batch__item otl-batch__item--${item.status}`}
						data-testid={`batch-item-${item.index}`}
					>
						<div className="otl-batch__item-head">
							<span className="otl-batch__item-no">Run #{item.index}</span>
							<span
								className={`otl-batch__item-badge otl-batch__item-badge--${item.status}`}
							>
								{statusLabel(item.status)}
							</span>
						</div>
						<div className="otl-batch__item-foot">
							<span className="otl-batch__item-dur otl-mono">
								{formatDuration(item.durationMs)}
							</span>
							{item.runId &&
								(item.status === "passed" ||
									item.status === "failed" ||
									item.status === "cancelled") && (
									<button
										type="button"
										className="otl-batch__item-link"
										onClick={() => navigate(`/report/${item.runId}`)}
									>
										Voir le détail
									</button>
								)}
						</div>
					</div>
				))}
			</div>

			<div className="otl-batch__actions">
				<button
					type="button"
					className="otl-tab"
					onClick={() => navigate("/scenarios")}
				>
					Retour aux scénarios
				</button>
			</div>
		</div>
	);
}
