import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { DoctorCheck, MobileDoctorReport } from "../../shared/types";

// Ordre d'affichage des contrôles du diagnostic.
const CHECK_KEYS: Array<keyof Omit<MobileDoctorReport, "allOk">> = [
	"java",
	"maestro",
	"adb",
	"device",
];

// Pages d'installation ouvertes pour les prérequis non auto-installables.
const LINKS: Record<string, string> = {
	java: "https://adoptium.net/temurin/releases/?version=17",
	adb: "https://developer.android.com/tools/releases/platform-tools",
};

function CheckRow({
	check,
	action,
	extraError,
}: {
	check: DoctorCheck;
	action?: ReactNode;
	extraError?: string;
}): JSX.Element {
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
				{extraError && (
					<div className="otl-doctor__hint otl-doctor__error">{extraError}</div>
				)}
			</div>
			{action && <div className="otl-doctor__action">{action}</div>}
		</div>
	);
}

export default function MobileDoctor(): JSX.Element {
	const navigate = useNavigate();
	const [report, setReport] = useState<MobileDoctorReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState("");
	const [progress, setProgress] = useState<number | null>(null);
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

	useEffect(() => {
		const off = window.api.onMaestroProgress(({ received, total }) => {
			setProgress(total > 0 ? Math.round((received / total) * 100) : null);
		});
		return off;
	}, []);

	async function bootEmulator(): Promise<void> {
		setLoading(true);
		try {
			await window.api.startDevice();
		} finally {
			// Toujours revérifier après tentative de démarrage.
			await refresh();
		}
	}

	// Télécharge le binaire Maestro géré (spinner + % via onMaestroProgress).
	async function prepareMaestro(): Promise<void> {
		setPreparing(true);
		setPrepareError("");
		setProgress(null);
		try {
			const res = await window.api.prepareMaestro();
			if (!res?.ok) setPrepareError(res?.error ?? "Échec de la préparation.");
		} catch {
			setPrepareError("Échec de la préparation.");
		} finally {
			setProgress(null);
			await refresh();
			setPreparing(false);
		}
	}

	// Construit l'action d'une ligne en échec selon le prérequis.
	// #34: fallback pour les clés inconnues via LINKS, puis null.
	function actionFor(key: (typeof CHECK_KEYS)[number]): ReactNode {
		if (key === "maestro")
			return (
				<button
					type="button"
					className="otl-tab"
					disabled={preparing}
					onClick={prepareMaestro}
				>
					{preparing
						? progress !== null
							? `Préparation… ${progress}%`
							: "Préparation…"
						: "Préparer"}
				</button>
			);
		if (key === "device")
			return (
				<button
					type="button"
					className="otl-tab"
					disabled={loading}
					onClick={bootEmulator}
				>
					Démarrer un émulateur
				</button>
			);
		if (LINKS[key])
			return (
				<button
					type="button"
					className="otl-tab"
					onClick={() => window.api.openExternal(LINKS[key])}
				>
					Ouvrir la page
				</button>
			);
		return null;
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

			{/* #15: conseil d'onboarding vers Environnements */}
			<p className="otl-hub-subtitle">
				Avant d'enregistrer, configure l'App ID de ton application dans{" "}
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					Environnements
				</button>
				.
			</p>

			<div className="otl-surface otl-doctor">
				{report ? (
					CHECK_KEYS.map((k) => {
						const check = report[k];
						return (
							<CheckRow
								key={k}
								check={check}
								action={check.ok ? undefined : actionFor(k)}
								extraError={
									k === "maestro" && prepareError ? prepareError : undefined
								}
							/>
						);
					})
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
			</div>
		</div>
	);
}
