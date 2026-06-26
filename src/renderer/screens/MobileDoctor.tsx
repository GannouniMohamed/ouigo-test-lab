import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DoctorCheck, MobileDoctorReport } from "../../shared/types";

// Ordre d'affichage des contrôles du diagnostic.
const CHECK_KEYS: Array<keyof Omit<MobileDoctorReport, "allOk">> = [
	"java",
	"maestro",
	"adb",
	"studio",
	"device",
];

function CheckRow({ check }: { check: DoctorCheck }): JSX.Element {
	return (
		<div className={`otl-doctor__row${check.ok ? " is-ok" : " is-bad"}`}>
			<span className="otl-doctor__icon" aria-hidden="true">
				{check.ok ? "✓" : "✗"}
			</span>
			<div className="otl-doctor__body">
				<div className="otl-doctor__label">
					{check.label}
					{check.version && (
						<span className="otl-doctor__version"> · {check.version}</span>
					)}
				</div>
				{!check.ok && check.hint && (
					<div className="otl-doctor__hint">{check.hint}</div>
				)}
			</div>
		</div>
	);
}

export default function MobileDoctor(): JSX.Element {
	const navigate = useNavigate();
	const [report, setReport] = useState<MobileDoctorReport | null>(null);
	const [loading, setLoading] = useState(false);
	const cancelled = useRef(false);

	const refresh = useCallback(async (): Promise<void> => {
		setLoading(true);
		try {
			const r = await window.api.mobileDoctor();
			if (!cancelled.current) setReport(r);
		} finally {
			if (!cancelled.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		cancelled.current = false;
		refresh();
		return () => {
			cancelled.current = true;
		};
	}, [refresh]);

	async function bootEmulator(): Promise<void> {
		setLoading(true);
		try {
			await window.api.startDevice();
		} finally {
			// Toujours revérifier après tentative de démarrage.
			await refresh();
		}
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/scenarios")}
				>
					← Scénarios
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Diagnostic mobile</span>
			</nav>

			<h1 className="otl-hub-title">Diagnostic mobile</h1>
			<p className="otl-hub-subtitle">
				Vérifie les prérequis pour enregistrer et exécuter des tests mobiles
				avec Maestro.
			</p>

			<div className="otl-surface otl-doctor">
				{report ? (
					CHECK_KEYS.map((k) => <CheckRow key={k} check={report[k]} />)
				) : (
					<div className="otl-doctor__row">
						<span className="otl-doctor__body">Diagnostic en cours…</span>
					</div>
				)}
			</div>

			<div className="otl-create__actions">
				<button
					type="button"
					className="otl-btn-primary"
					disabled={loading}
					onClick={refresh}
				>
					Revérifier
				</button>
				<button
					type="button"
					className="otl-tab"
					disabled={loading}
					onClick={bootEmulator}
				>
					Démarrer un émulateur
				</button>
			</div>
		</div>
	);
}
