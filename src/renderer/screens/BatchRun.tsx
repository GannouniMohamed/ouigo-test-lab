import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	type BatchItem,
	type BatchReport,
	summarizeBatch,
} from "../../shared/types";
import { formatAt, formatDuration } from "../lib/time";

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

function statusIcon(status: BatchItem["status"]): string {
	switch (status) {
		case "passed":
			return "✓";
		case "failed":
			return "✕";
		case "running":
			return "●";
		case "cancelled":
			return "⊘";
		default:
			return "○";
	}
}

// SVG ring whose cyan arc length encodes passed/total. Falls back to a flat
// (empty) ring when there is nothing finished yet — never produces NaN.
function Donut({
	passed,
	total,
}: {
	passed: number;
	total: number;
}): JSX.Element {
	const radius = 34;
	const circumference = 2 * Math.PI * radius;
	const ratio = total > 0 ? Math.min(Math.max(passed / total, 0), 1) : 0;
	const dash = ratio * circumference;
	return (
		<svg
			className="otl-donut"
			viewBox="0 0 80 80"
			role="img"
			aria-label={`${passed} sur ${total} réussis`}
		>
			<circle
				className="otl-donut__track"
				cx="40"
				cy="40"
				r={radius}
				fill="none"
				strokeWidth="8"
			/>
			<circle
				className="otl-donut__arc"
				cx="40"
				cy="40"
				r={radius}
				fill="none"
				strokeWidth="8"
				strokeLinecap="round"
				strokeDasharray={`${dash} ${circumference - dash}`}
				transform="rotate(-90 40 40)"
			/>
			<text className="otl-donut__value" x="40" y="40">
				{passed}/{total}
			</text>
		</svg>
	);
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

	return (
		<div className="otl-batch" style={{ padding: "2rem" }}>
			{/* ── Header: status, scenario name, chips, lot meta ────────────── */}
			<div className="otl-batch__header">
				<div className="otl-batch__heading">
					<span
						className={`otl-run-status${finished ? " otl-run-status--done" : ""}`}
					>
						<span className="otl-run-status__dot" />
						{finished ? "Terminé" : "En cours"}
					</span>
					<h1 className="otl-batch__title">{batch.scenarioName}</h1>
					<div className="otl-batch__chips">
						<span className="otl-chip">
							{batch.mode === "visible" ? "Visible" : "Invisible"}
						</span>
						<span className="otl-chip">
							{batch.execution === "parallel" ? "Parallèle" : "Séquentiel"}
						</span>
						<span className="otl-chip">{batch.environmentLabel}</span>
					</div>
				</div>
				<span className="otl-batch__meta">
					lot · {formatAt(batch.startedAt)}
				</span>
			</div>

			{/* ── KPI band ───────────────────────────────────────────────────── */}
			<div className="otl-kpi">
				<div className="otl-kpi__tile otl-kpi__tile--donut">
					<Donut passed={stats.passed} total={stats.total} />
					<span className="otl-kpi__label">runs réussis</span>
				</div>
				<div className="otl-kpi__tile">
					<span
						className={`otl-kpi__value${stats.failed > 0 ? " otl-kpi__value--bad" : ""}`}
					>
						{stats.failed}
					</span>
					<span className="otl-kpi__label">échecs</span>
				</div>
				<div className="otl-kpi__tile">
					<span className="otl-kpi__value otl-mono">
						{formatDuration(stats.minMs)}
					</span>
					<span className="otl-kpi__label">MIN</span>
				</div>
				<div className="otl-kpi__tile">
					<span className="otl-kpi__value otl-mono">
						{formatDuration(stats.avgMs)}
					</span>
					<span className="otl-kpi__label">MOYENNE</span>
				</div>
				<div className="otl-kpi__tile">
					<span className="otl-kpi__value otl-mono">
						{formatDuration(stats.maxMs)}
					</span>
					<span className="otl-kpi__label">MAX</span>
				</div>
			</div>

			{/* ── Run cards ──────────────────────────────────────────────────── */}
			<h2 className="otl-batch__section-title">EXÉCUTIONS DU LOT</h2>
			<div className="otl-batch__grid">
				{batch.items.map((item) => {
					const drillable =
						item.runId != null &&
						(item.status === "passed" ||
							item.status === "failed" ||
							item.status === "cancelled");
					return (
						<div
							key={item.index}
							className={`otl-batch__item otl-batch__item--${item.status}`}
							data-testid={`batch-item-${item.index}`}
						>
							<div className="otl-batch__item-head">
								<span className="otl-batch__item-no">
									<span
										className={`otl-batch__item-icon otl-batch__item-icon--${item.status}`}
									>
										{statusIcon(item.status)}
									</span>
									Run #{item.index}
								</span>
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
								{drillable && (
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
					);
				})}
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
