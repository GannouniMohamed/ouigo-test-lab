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
	// #18: track whether stopRecording succeeded but runScenario failed
	const [runFailed, setRunFailed] = useState(false);
	// #18: store the saved scenario so the retry button can re-trigger the run
	const [savedScenario, setSavedScenario] = useState<{
		id: string;
		projectId: string;
		tunnelId: string;
		platform: string;
	} | null>(null);
	const [savedEnv, setSavedEnv] = useState<string>("");
	// Task 3: after a successful mobile stop, show captured scenario read-only
	// before running (confirm-before-run). Stores the scenario name + a note.
	const [capturedFlowText, setCapturedFlowText] = useState<string | null>(null);
	// Task 3: whether to reveal the manual paste fallback textarea
	const [showPasteFallback, setShowPasteFallback] = useState(false);

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

	// #17: avertissement de format si le flow collé ne contient pas "appId:"
	const flowFormatWarning =
		isMobile && pastedFlow.trim().length > 0 && !pastedFlow.includes("appId:");

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
		setRunFailed(false);
		setCapturedFlowText(null);
		setShowPasteFallback(false);
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
		let stopSucceeded = false;
		try {
			if (isMobile) {
				// Task 3: mobile path — pass pastedFlow (or undefined for clipboard path);
				// do NOT auto-run; show confirm-before-run view instead.
				const flowArg = pastedFlow.trim() || undefined;
				const scenario = await window.api.stopRecording(recordingId, flowArg);
				stopSucceeded = true;
				setRecordingId(null);
				const env =
					activeEnvByProject[scenario.projectId] ||
					scenario.defaultEnvironmentId ||
					environments[0]?.id ||
					"local";
				setSavedScenario({
					id: scenario.id,
					projectId: scenario.projectId,
					tunnelId: scenario.tunnelId,
					platform: scenario.platform,
				});
				setSavedEnv(env);
				setFirstRunScenarioId(scenario.id);
				setCurrentScenarioName(scenario.name);
				// Show the captured scenario info read-only. The Scenario type does not
				// include the raw flow text — only metadata. Display the name + note.
				setCapturedFlowText(scenario.name);
			} else {
				// Web/responsive: keep existing auto-run path unchanged.
				const scenario = await window.api.stopRecording(recordingId, undefined);
				stopSucceeded = true;
				setRecordingId(null);
				const env =
					activeEnvByProject[scenario.projectId] ||
					scenario.defaultEnvironmentId ||
					environments[0]?.id ||
					"local";
				setSavedScenario({
					id: scenario.id,
					projectId: scenario.projectId,
					tunnelId: scenario.tunnelId,
					platform: scenario.platform,
				});
				setSavedEnv(env);
				setFirstRunScenarioId(scenario.id);
				setCurrentScenarioName(scenario.name);
				const { runId, steps } = await window.api.runScenario(
					scenario.projectId,
					scenario.tunnelId,
					scenario.id,
					env,
				);
				setPastedFlow("");
				setRunFailed(false);
				setSavedScenario(null);
				navigate(`/run/${runId}`, { state: { auto: true, steps } });
			}
		} catch (err) {
			// On reste sur le formulaire avec un message clair plutôt que de
			// rediriger en silence. « Aucune étape » est le cas le plus courant
			// (rien enregistré, clipboard vide) — on révèle la saisie manuelle.
			setFirstRunScenarioId(null);
			const msg =
				err instanceof Error
					? err.message
					: "Impossible d'arrêter l'enregistrement.";
			setRecError(msg);
			// Task 3: auto-reveal the paste fallback on "Aucune étape" error
			if (/étape/i.test(msg) && isMobile) {
				setShowPasteFallback(true);
			}
			// #18: if stopRecording succeeded but runScenario failed (web path)
			if (stopSucceeded && !isMobile) {
				setRunFailed(true);
			}
		} finally {
			setStopping(false);
		}
	}

	// Shared run logic: called after confirm (Lancer) for mobile, and for retry
	// after run failure. Renamed from handleRetry.
	async function runSavedScenario() {
		if (!savedScenario) return;
		setStopping(true);
		setRecError("");
		try {
			const { runId, steps } = await window.api.runScenario(
				savedScenario.projectId,
				savedScenario.tunnelId,
				savedScenario.id,
				savedEnv,
				savedScenario.platform === "mobile" ? { deviceId } : undefined,
			);
			setPastedFlow("");
			setRunFailed(false);
			setSavedScenario(null);
			setCapturedFlowText(null);
			navigate(`/run/${runId}`, { state: { auto: true, steps } });
		} catch (err) {
			// Run failed — show retry affordance
			setRunFailed(true);
			setCapturedFlowText(null);
			setRecError(
				err instanceof Error
					? err.message
					: "Impossible de relancer l'exécution.",
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
		setRunFailed(false);
		setCapturedFlowText(null);
		setShowPasteFallback(false);
	}

	// #18: afficher le bloc mobile quand enregistrement actif OU après un run raté
	// Task 3: also show when capturedFlowText is set (confirm-before-run state)
	const showMobileRecording =
		isMobile &&
		(recordingId !== null || runFailed || capturedFlowText !== null);

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
						{/* #14: escape hatch with actionable link to environments */}
						{!hasApp && (
							<p id="no-app-hint" className="otl-mobilebar__hint">
								Configure une application mobile sur l'environnement{" "}
								<strong>{inheritedEnvLabel}</strong> pour enregistrer un
								parcours mobile.{" "}
								<button
									type="button"
									className="otl-breadcrumb__link"
									onClick={() =>
										navigate(`/projects/${activeProjectId}/environments`)
									}
								>
									Configurer l'environnement
								</button>
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
									? "Maestro Studio s'ouvre dans une fenêtre de l'app : enregistre ton parcours, clique « Copy », puis « Terminer »."
									: "Naviguez dans le navigateur, les actions sont capturées automatiquement."}
							</div>
						</div>
					</div>

					{!recordingId && !runFailed && capturedFlowText === null ? (
						<button
							type="button"
							className="otl-btn-primary otl-method__btn"
							disabled={!name.trim() || !mobileReady || starting}
							// #14: aria-describedby pointing at the no-app hint
							{...(isMobile && !hasApp
								? {
										"aria-describedby": "no-app-hint",
										title:
											"Configure l'App ID dans Environnements pour activer l'enregistrement mobile",
									}
								: {})}
							onClick={handleStart}
						>
							{starting ? "Démarrage…" : "Démarrer l'enregistrement"}
						</button>
					) : showMobileRecording ? (
						<div className="otl-method__recording">
							{/* Task 3: confirm-before-run state — scenario saved, awaiting Lancer */}
							{capturedFlowText !== null ? (
								<>
									<div className="otl-recording-indicator">
										<span className="otl-recording-indicator__dot" />
										Scénario enregistré : <strong>{capturedFlowText}</strong>
									</div>
									<p className="otl-mobilebar__hint">
										Vérifie le scénario puis lance l'exécution.
									</p>
									{/* Retain the paste fallback area for visibility / retry context */}
									{pastedFlow && (
										<textarea
											className="otl-input otl-method__paste"
											aria-label="Parcours enregistré"
											readOnly
											value={pastedFlow}
											rows={8}
										/>
									)}
									<div className="otl-method__rec-actions">
										<button
											type="button"
											className="otl-btn-primary otl-method__btn"
											disabled={stopping}
											onClick={runSavedScenario}
										>
											{stopping ? "Lancement…" : "Lancer"}
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
								</>
							) : (
								<>
									{runFailed ? (
										<>
											<div className="otl-recording-indicator">
												<span className="otl-recording-indicator__dot" />
												Scénario sauvegardé — relance l'exécution.
											</div>
											{/* Keep paste textarea visible for retry context */}
											<textarea
												className="otl-input otl-method__paste"
												aria-label="Parcours enregistré"
												placeholder="Colle ici le parcours copié depuis Maestro Studio…"
												value={pastedFlow}
												onChange={(e) => setPastedFlow(e.target.value)}
												rows={8}
											/>
											<div className="otl-method__rec-actions">
												{/* #18: retry affordance après un échec de run */}
												<button
													type="button"
													className="otl-btn-primary otl-method__btn"
													disabled={stopping}
													onClick={runSavedScenario}
												>
													{stopping ? "Relance…" : "Réessayer l'exécution"}
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
										</>
									) : (
										<>
											{/* Task 3: active recording state — new embedded Studio UX */}
											<div className="otl-recording-indicator">
												<span className="otl-recording-indicator__dot" />
												Enregistre dans la fenêtre Maestro Studio, clique{" "}
												<strong>Copy</strong>, puis <strong>Terminer</strong>.
											</div>
											{/* Collapsible manual paste fallback */}
											<button
												type="button"
												className="otl-tab"
												onClick={() => setShowPasteFallback((prev) => !prev)}
											>
												Coller manuellement
											</button>
											{showPasteFallback && (
												<>
													<textarea
														className="otl-input otl-method__paste"
														aria-label="Parcours enregistré"
														placeholder="Colle ici le parcours copié depuis Maestro Studio…"
														value={pastedFlow}
														onChange={(e) => setPastedFlow(e.target.value)}
														rows={8}
													/>
													{/* #17: indice de format */}
													<p className="otl-mobilebar__hint">
														Le flow doit commencer par <code>appId:</code> et
														contenir au moins une action.
													</p>
													{/* #17: avertissement de format */}
													{flowFormatWarning && (
														<p className="otl-mobilebar__hint otl-mobilebar__hint--error">
															Le flow doit commencer par <code>appId:</code> —
															vérifie le contenu collé.
														</p>
													)}
												</>
											)}
											<div className="otl-method__rec-actions">
												<button
													type="button"
													className="otl-btn-primary otl-method__btn"
													disabled={stopping}
													onClick={handleStop}
												>
													{stopping ? "Arrêt…" : "Terminer l'enregistrement"}
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
										</>
									)}
								</>
							)}
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
