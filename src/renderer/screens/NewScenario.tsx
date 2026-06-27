import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
	Environment,
	MobileDevice,
	Platform,
	Tunnel,
} from "../../shared/types";
import { Select } from "../components/Select";
import { useAppStore } from "../store";

export default function NewScenario(): JSX.Element {
	const navigate = useNavigate();
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const activeEnvByProject = useAppStore((s) => s.activeEnvByProject);
	const setFirstRunScenarioId = useAppStore((s) => s.setFirstRunScenarioId);
	const setCurrentScenarioName = useAppStore((s) => s.setCurrentScenarioName);

	const [name, setName] = useState("");
	const [recordingId, setRecordingId] = useState<string | null>(null);
	const [platform, setPlatform] = useState<Platform>("web");
	const [tunnels, setTunnels] = useState<Tunnel[]>([]);
	const [tunnelId, setTunnelId] = useState("");
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [devices, setDevices] = useState<MobileDevice[]>([]);
	const [deviceId, setDeviceId] = useState("");
	const [booting, setBooting] = useState(false);
	const [deviceError, setDeviceError] = useState("");
	const [appInstalling, setAppInstalling] = useState(false);
	const [appInstallMsg, setAppInstallMsg] = useState("");
	const [appInstallOk, setAppInstallOk] = useState(false);
	const [starting, setStarting] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [recError, setRecError] = useState("");
	const [pastedFlow, setPastedFlow] = useState("");

	// Env is inherited from the active project — no per-scenario selection.
	// Resolve it exactly like the context bar: the actively-selected env, else the
	// project's first env. Only fall back to the literal "Local" when the project
	// genuinely has no environments (so a fresh project shows its real 1st env,
	// e.g. "Préprod", instead of a non-existent "local").
	const inheritedEnvId =
		activeEnvByProject[activeProjectId] || environments[0]?.id || "";
	const inheritedEnv = environments.find((e) => e.id === inheritedEnvId);
	const inheritedEnvLabel = inheritedEnv?.label ?? "Local";

	// Pré-vol mobile : l'env doit porter une app ET un appareil doit être choisi.
	const hasApp = !!inheritedEnv?.app?.appId;
	const isMobile = platform === "mobile";
	const isFirebase = inheritedEnv?.app?.source === "firebase";
	const mobileReady = !isMobile || (hasApp && !!deviceId);

	useEffect(() => {
		if (!activeProjectId) return;
		window.api.listTunnels(activeProjectId).then((t) => {
			setTunnels(t);
			setTunnelId((current) => current || t[0]?.id || "");
		});
		window.api
			.listEnvironments(activeProjectId)
			.then((envs) => setEnvironments(envs ?? []))
			.catch(() => setEnvironments([]));
	}, [activeProjectId]);

	// Charge la liste des appareils quand on bascule sur Mobile, et sélectionne
	// par défaut le premier appareil démarré (sinon le premier disponible).
	useEffect(() => {
		if (!isMobile) return;
		refreshDevices();
	}, [isMobile]);

	async function refreshDevices(): Promise<void> {
		const list = await window.api.listDevices().catch(() => []);
		setDevices(list);
		setDeviceId((cur) => {
			if (cur && list.some((d) => d.id === cur)) return cur;
			const booted = list.find((d) => d.state === "booted");
			return booted?.id ?? list[0]?.id ?? "";
		});
	}

	// Démarre un émulateur. startDevice signale l'échec via {ok,error} (pas un
	// rejet), mais on couvre aussi un rejet (binaire absent…). On bloque le
	// bouton pendant le boot (long, 30-60s) pour éviter les démarrages multiples.
	async function bootEmulator(): Promise<void> {
		setBooting(true);
		setDeviceError("");
		try {
			const res = await window.api.startDevice();
			if (!res?.ok) {
				setDeviceError(
					res?.error ?? "Impossible de démarrer l'émulateur — voir Diagnostic.",
				);
			}
		} catch {
			setDeviceError("Impossible de démarrer l'émulateur — voir Diagnostic.");
		} finally {
			await refreshDevices();
			setBooting(false);
		}
	}

	// Installe l'app depuis Firebase sur l'appareil sélectionné (pull du dernier
	// APK + adb install -r). Permet de valider la config Firebase avant de
	// commencer, au lieu de la découvrir au lancement.
	async function installFirebaseApp(): Promise<void> {
		if (!deviceId) return;
		setAppInstalling(true);
		setAppInstallMsg("");
		try {
			const res = await window.api.installApp(
				activeProjectId,
				inheritedEnvId,
				deviceId,
			);
			setAppInstallOk(!!res?.ok);
			setAppInstallMsg(
				res?.ok
					? "App installée ✓"
					: (res?.error ?? "Échec de l'installation."),
			);
		} catch {
			setAppInstallOk(false);
			setAppInstallMsg("Échec de l'installation.");
		} finally {
			setAppInstalling(false);
		}
	}

	async function handleStart() {
		// Le démarrage peut être lent (mobile : pull Firebase + lancement Studio)
		// et échouer côté main (app absente, appareil injoignable, Studio…).
		// Sans ce try/catch, l'erreur était avalée → « rien ne se passe ».
		setStarting(true);
		setRecError("");
		try {
			const { recordingId: id } = await window.api.startRecording({
				name,
				browser: "chromium",
				environmentId: inheritedEnvId || "local",
				projectId: activeProjectId,
				tunnelId: tunnelId || "general",
				platform,
				...(isMobile ? { deviceId } : {}),
			});
			setRecordingId(id);
		} catch (err) {
			setRecError(
				err instanceof Error
					? err.message
					: "Impossible de démarrer l'enregistrement.",
			);
		} finally {
			setStarting(false);
		}
	}

	async function handleStop() {
		if (!recordingId) return;
		setStopping(true);
		setRecError("");
		try {
			const scenario = await window.api.stopRecording(
				recordingId,
				isMobile ? pastedFlow : undefined,
			);
			// Enregistrement consommé : on libère pour éviter un double-stop.
			setRecordingId(null);
			setPastedFlow("");
			const env =
				activeEnvByProject[scenario.projectId] ||
				scenario.defaultEnvironmentId ||
				environments[0]?.id ||
				"local";
			setFirstRunScenarioId(scenario.id);
			setCurrentScenarioName(scenario.name);
			const { runId, steps } =
				scenario.platform === "mobile"
					? await window.api.runScenario(
							scenario.projectId,
							scenario.tunnelId,
							scenario.id,
							env,
							{ deviceId },
						)
					: await window.api.runScenario(
							scenario.projectId,
							scenario.tunnelId,
							scenario.id,
							env,
						);
			navigate(`/run/${runId}`, { state: { auto: true, steps } });
		} catch (err) {
			// On reste sur le formulaire avec un message clair plutôt que de
			// rediriger en silence. « Aucun flow détecté » est le cas le plus
			// courant (rien enregistré) — l'utilisateur peut réessayer.
			setFirstRunScenarioId(null);
			setRecError(
				err instanceof Error
					? err.message
					: "Impossible d'arrêter l'enregistrement.",
			);
		} finally {
			setStopping(false);
		}
	}

	async function handleCancel() {
		if (!recordingId) return;
		try {
			await window.api.cancelRecording(recordingId);
		} catch {
			/* annulation best-effort */
		}
		setRecordingId(null);
		setPastedFlow("");
		setRecError("");
	}

	return (
		<div className="ns-page">
			<h1 className="otl-hub-title">Nouveau scénario</h1>
			<p className="otl-hub-subtitle">
				Enregistrez un parcours — aucun code à écrire.
			</p>

			<div className="ns-form">
				{/* Platform selector */}
				<div className="ns-platforms">
					{/* Web card */}
					<button
						type="button"
						className={`otl-platform${platform === "web" ? " otl-platform--selected" : ""}`}
						onClick={() => setPlatform("web")}
					>
						<span className="otl-platform__icon">
							{/* Globe SVG */}
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" />
								<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Web Desktop</span>
							<span className="otl-platform__sub">Playwright</span>
						</span>
						<span className="otl-platform__check">
							{platform === "web" ? (
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="var(--otl-cyan)"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<path
										d="M8 12l3 3 5-5"
										stroke="#fff"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							) : (
								<span className="otl-platform__hollow-circle" />
							)}
						</span>
					</button>

					{/* Responsive card */}
					<button
						type="button"
						className={`otl-platform${platform === "responsive" ? " otl-platform--selected" : ""}`}
						onClick={() => setPlatform("responsive")}
					>
						<span className="otl-platform__icon">
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<rect x="3" y="4" width="18" height="12" rx="1.5" />
								<path d="M9 20h6M12 16v4" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Responsive</span>
							<span className="otl-platform__sub">Playwright</span>
						</span>
						<span className="otl-platform__check">
							{platform === "responsive" ? (
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="var(--otl-cyan)"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<path
										d="M8 12l3 3 5-5"
										stroke="#fff"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							) : (
								<span className="otl-platform__hollow-circle" />
							)}
						</span>
					</button>

					{/* Mobile card */}
					<button
						type="button"
						className={`otl-platform${platform === "mobile" ? " otl-platform--selected" : ""}`}
						onClick={() => setPlatform("mobile")}
					>
						<span className="otl-platform__icon">
							{/* Phone SVG */}
							<svg
								width="30"
								height="30"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
								<line x1="12" y1="18" x2="12.01" y2="18" />
							</svg>
						</span>
						<span className="otl-platform__labels">
							<span className="otl-platform__name">Mobile</span>
							<span className="otl-platform__sub">Maestro</span>
						</span>
						<span className="otl-platform__check">
							{platform === "mobile" ? (
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="var(--otl-cyan)"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<path
										d="M8 12l3 3 5-5"
										stroke="#fff"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							) : (
								<span className="otl-platform__hollow-circle" />
							)}
						</span>
					</button>
				</div>

				{/* Mobile : sélecteur d'appareil + pré-vol */}
				{isMobile && (
					<div className="otl-mobilebar">
						<div className="otl-mobilebar__row">
							<div className="otl-mobilebar__device">
								<div className="otl-field-label">Appareil</div>
								<Select
									ariaLabel="Appareil"
									value={deviceId}
									onChange={setDeviceId}
									placeholder="Aucun appareil détecté"
									options={devices.map((d) => ({
										value: d.id,
										label: `${d.name} · ${d.state === "booted" ? "démarré" : "hors ligne"}`,
									}))}
								/>
							</div>
							<button
								type="button"
								className="otl-tab"
								disabled={booting}
								onClick={bootEmulator}
							>
								{booting ? "Démarrage…" : "Démarrer un émulateur"}
							</button>
							<button
								type="button"
								className="otl-tab"
								onClick={() => navigate("/mobile/doctor")}
							>
								Diagnostic
							</button>
						</div>
						{deviceError && (
							<p className="otl-mobilebar__hint otl-mobilebar__hint--error">
								{deviceError}
							</p>
						)}
						{!hasApp && (
							<p className="otl-mobilebar__hint">
								Configure une application mobile sur l'environnement{" "}
								<strong>{inheritedEnvLabel}</strong> pour enregistrer un
								parcours mobile.
							</p>
						)}
						{hasApp && !deviceId && (
							<p className="otl-mobilebar__hint">
								Sélectionne un appareil (ou démarre un émulateur) pour
								continuer.
							</p>
						)}
						{isFirebase && (
							<div className="otl-mobilebar__row">
								<button
									type="button"
									className="otl-tab"
									disabled={!deviceId || appInstalling}
									onClick={installFirebaseApp}
								>
									{appInstalling
										? "Installation…"
										: "Installer l'app (Firebase)"}
								</button>
								{appInstallMsg && (
									<span
										className={`otl-mobilebar__hint${appInstallOk ? "" : " otl-mobilebar__hint--error"}`}
									>
										{appInstallMsg}
									</span>
								)}
							</div>
						)}
					</div>
				)}

				{/* Tunnel */}
				<div>
					<div className="otl-field-label">Groupe</div>
					<Select
						ariaLabel="Groupe"
						value={tunnelId}
						onChange={setTunnelId}
						options={tunnels.map((t) => ({ value: t.id, label: t.name }))}
					/>
				</div>

				{/* Scenario name */}
				<div>
					<div className="otl-field-label">Nom du scénario</div>
					<input
						type="text"
						className="otl-input"
						placeholder="Nom du scénario"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				{/* Environment — inherited from the project, read-only */}
				<div>
					<div className="otl-field-label">Environnement</div>
					<div className="otl-envbanner" role="note">
						<span className="otl-envbanner__lock" aria-hidden="true">
							🔒
						</span>
						<span>
							Environnement <strong>{inheritedEnvLabel}</strong> · hérité du
							projet
						</span>
					</div>
				</div>

				{/* Recording method block */}
				<div className="otl-method otl-method--rec">
					<div className="otl-method__header">
						<span className="otl-method__icon-badge">
							{/* Record dot SVG */}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="var(--otl-danger)"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" />
							</svg>
						</span>
						<div>
							<div className="otl-method__title">Enregistrer en naviguant</div>
							<div className="otl-method__desc">
								{isMobile
									? "Maestro Studio s'ouvre dans ton navigateur : enregistre ton parcours, clique « Copy », puis colle-le ici."
									: "Naviguez dans le navigateur, les actions sont capturées automatiquement."}
							</div>
						</div>
					</div>

					{!recordingId ? (
						<button
							type="button"
							className="otl-btn-primary otl-method__btn"
							disabled={!name.trim() || !mobileReady || starting}
							onClick={handleStart}
						>
							{starting ? "Démarrage…" : "Démarrer l'enregistrement"}
						</button>
					) : isMobile ? (
						<div className="otl-method__recording">
							<div className="otl-recording-indicator">
								<span className="otl-recording-indicator__dot" />
								Studio ouvert dans le navigateur — enregistre ton parcours,
								clique « Copy », puis colle-le ci-dessous.
							</div>
							<textarea
								className="otl-input otl-method__paste"
								aria-label="Parcours enregistré"
								placeholder="Colle ici le parcours copié depuis Maestro Studio…"
								value={pastedFlow}
								onChange={(e) => setPastedFlow(e.target.value)}
								rows={8}
							/>
							<div className="otl-method__rec-actions">
								<button
									type="button"
									className="otl-btn-primary otl-method__btn"
									disabled={!pastedFlow.trim() || stopping}
									onClick={handleStop}
								>
									{stopping ? "Création…" : "Créer le scénario"}
								</button>
								<button
									type="button"
									className="otl-tab"
									disabled={stopping}
									onClick={handleCancel}
								>
									Annuler
								</button>
							</div>
						</div>
					) : (
						<div className="otl-method__recording">
							<div className="otl-recording-indicator">
								<span className="otl-recording-indicator__dot" />
								Enregistrement en cours…
							</div>
							<button
								type="button"
								className="otl-btn-stop otl-method__btn"
								disabled={stopping}
								onClick={handleStop}
							>
								{stopping ? "Arrêt…" : "Arrêter l'enregistrement"}
							</button>
						</div>
					)}

					{recError && <p className="otl-method__error">{recError}</p>}
				</div>

				{/* AI method block — disabled, V3 */}
				<div className="otl-method otl-method--ai" aria-disabled="true">
					<div className="otl-method__header">
						<span className="otl-method__icon-badge otl-method__icon-badge--ai">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="var(--otl-blue)"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
							</svg>
						</span>
						<div className="otl-method__title-row">
							<span className="otl-method__title">Décrire avec l'IA</span>
							<span className="otl-ai__soon">IA · bientôt</span>
						</div>
					</div>
					<div className="otl-method__ai-placeholder">
						Ex : Tester la connexion puis l'accès au profil.
					</div>
				</div>
			</div>
		</div>
	);
}
