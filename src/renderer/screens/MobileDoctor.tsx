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
	"studio",
	"device",
];

// Pages d'installation ouvertes pour les prérequis non auto-installables.
const LINKS: Record<string, string> = {
	java: "https://adoptium.net/temurin/releases/?version=17",
	adb: "https://developer.android.com/tools/releases/platform-tools",
};

// Téléchargement direct de Maestro Studio selon l'OS (le .dmg/.exe/.AppImage
// du bucket studio.maestro.dev).
export function studioDownloadUrl(platform: string): string {
	const base = "https://studio.maestro.dev/";
	if (platform === "darwin") return `${base}MaestroStudio.dmg`;
	if (platform === "win32") return `${base}MaestroStudio.exe`;
	return `${base}MaestroStudio.AppImage`;
}

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
	const [installing, setInstalling] = useState(false);
	const [installError, setInstallError] = useState("");
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

	// Installe le Maestro CLI (script). Spinner simple + re-vérification auto ;
	// message court en cas d'échec.
	async function installCli(): Promise<void> {
		setInstalling(true);
		setInstallError("");
		try {
			const res = await window.api.installMaestro();
			if (!res?.ok) setInstallError(res?.error ?? "Échec de l'installation.");
		} catch {
			setInstallError("Échec de l'installation.");
		} finally {
			await refresh();
			setInstalling(false);
		}
	}

	// Construit l'action d'une ligne en échec selon le prérequis.
	function actionFor(key: (typeof CHECK_KEYS)[number]): ReactNode {
		if (key === "maestro")
			return (
				<button
					type="button"
					className="otl-tab"
					disabled={installing}
					onClick={installCli}
				>
					{installing ? "Installation…" : "Installer"}
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
		if (key === "studio")
			return (
				<button
					type="button"
					className="otl-tab"
					onClick={() =>
						window.api.openExternal(studioDownloadUrl(window.api.platform))
					}
				>
					Télécharger
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
									k === "maestro" && installError ? installError : undefined
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
