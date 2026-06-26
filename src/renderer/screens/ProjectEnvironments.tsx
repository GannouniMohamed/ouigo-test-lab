import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
	Environment,
	MobileApp,
	MobileAppSource,
	Project,
} from "../../shared/types";

export default function ProjectEnvironments(): JSX.Element {
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const [project, setProject] = useState<Project | null>(null);
	const [rows, setRows] = useState<Environment[]>([]);

	const load = useCallback(async (): Promise<void> => {
		const p = await window.api.getProject(id);
		setProject(p);
		setRows(p.environments);
	}, [id]);

	useEffect(() => {
		load();
	}, [load]);

	function updateRow(envId: string, patch: Partial<Environment>): void {
		setRows((rs) => rs.map((r) => (r.id === envId ? { ...r, ...patch } : r)));
	}

	// Active/désactive l'app mobile sur un environnement.
	function toggleApp(envId: string, on: boolean): void {
		updateRow(
			envId,
			on ? { app: { appId: "", source: "installed" } } : { app: undefined },
		);
	}

	// Patche l'app mobile d'un environnement de manière immuable.
	function updateApp(envId: string, patch: Partial<MobileApp>): void {
		setRows((rs) =>
			rs.map((r) =>
				r.id === envId && r.app ? { ...r, app: { ...r.app, ...patch } } : r,
			),
		);
	}

	// Change la source ; (dé)sème la config firebase selon le cas.
	function setAppSource(envId: string, source: MobileAppSource): void {
		setRows((rs) =>
			rs.map((r) => {
				if (r.id !== envId || !r.app) return r;
				if (source === "firebase") {
					return {
						...r,
						app: {
							...r.app,
							source,
							firebase: r.app.firebase ?? {
								projectNumber: "",
								firebaseAppId: "",
								serviceAccountKeyPath: "",
							},
						},
					};
				}
				const { firebase: _drop, ...rest } = r.app;
				return { ...r, app: { ...rest, source } };
			}),
		);
	}

	function updateFirebase(
		envId: string,
		patch: Partial<NonNullable<MobileApp["firebase"]>>,
	): void {
		setRows((rs) =>
			rs.map((r) => {
				if (r.id !== envId || !r.app?.firebase) return r;
				return {
					...r,
					app: { ...r.app, firebase: { ...r.app.firebase, ...patch } },
				};
			}),
		);
	}
	function addRow(): void {
		const base = "env";
		let nid = base;
		let n = 2;
		const ids = new Set(rows.map((r) => r.id));
		while (ids.has(nid)) nid = `${base}-${n++}`;
		setRows((rs) => [
			...rs,
			{ id: nid, label: "Nouvel environnement", baseURL: "", variables: {} },
		]);
	}

	async function save(): Promise<void> {
		// Upsert chaque ligne (id conservé), sans régénérer l'id.
		for (const r of rows) {
			await window.api.saveEnvironment(id, r);
		}
		await load();
	}

	async function remove(envId: string): Promise<void> {
		await window.api.deleteEnvironment(id, envId);
		await load();
	}

	return (
		<div className="otl-screen">
			<nav className="otl-breadcrumb">
				<button
					type="button"
					className="otl-breadcrumb__link"
					onClick={() => navigate("/projects")}
				>
					← Projets
				</button>
				<span className="otl-breadcrumb__sep">/</span>
				<span>{project?.name ?? "…"}</span>
				<span className="otl-breadcrumb__sep">/</span>
				<span>Environnements</span>
			</nav>

			<div className="otl-create__envhead">
				<h1 className="otl-hub-title">Environnements</h1>
				<button type="button" className="otl-tab" onClick={addRow}>
					+ Ajouter
				</button>
			</div>
			<p className="otl-hub-subtitle">
				Modifiez le libellé et l'URL de chaque environnement du projet{" "}
				{project?.name ?? ""}.
			</p>

			<div className="otl-envtable">
				<div className="otl-envtable__head">
					<span className="otl-field-label">Libellé</span>
					<span className="otl-field-label">URL Web</span>
					<span />
				</div>
				{rows.map((r) => (
					<div className="otl-envrow-wrap" key={r.id}>
						<div className="otl-envrow">
							<input
								className="otl-input otl-envrow__label"
								value={r.label}
								onChange={(e) => updateRow(r.id, { label: e.target.value })}
							/>
							<input
								className="otl-input otl-envrow__urlwrap"
								value={r.baseURL}
								onChange={(e) => updateRow(r.id, { baseURL: e.target.value })}
							/>
							<button
								type="button"
								className="otl-envrow__remove"
								aria-label="Supprimer l'environnement"
								disabled={rows.length <= 1}
								onClick={() => remove(r.id)}
							>
								–
							</button>
						</div>

						<div className="otl-envapp">
							<label className="otl-envapp__toggle">
								<input
									type="checkbox"
									checked={!!r.app}
									onChange={(e) => toggleApp(r.id, e.target.checked)}
								/>
								<span>Application mobile (Maestro)</span>
							</label>

							{r.app && (
								<div className="otl-envapp__fields">
									<div>
										<div className="otl-field-label">
											App ID (nom de package)
										</div>
										<input
											className="otl-input"
											placeholder="com.exemple.app"
											value={r.app.appId}
											onChange={(e) =>
												updateApp(r.id, { appId: e.target.value })
											}
										/>
									</div>

									<div
										className="otl-envapp__source"
										role="radiogroup"
										aria-label="Source de l'application"
									>
										<label>
											<input
												type="radio"
												name={`app-source-${r.id}`}
												checked={r.app.source === "installed"}
												onChange={() => setAppSource(r.id, "installed")}
											/>
											<span>Déjà installée</span>
										</label>
										<label>
											<input
												type="radio"
												name={`app-source-${r.id}`}
												checked={r.app.source === "firebase"}
												onChange={() => setAppSource(r.id, "firebase")}
											/>
											<span>Firebase App Distribution</span>
										</label>
									</div>

									{r.app.source === "firebase" && r.app.firebase && (
										<div className="otl-envapp__firebase">
											<input
												className="otl-input"
												placeholder="Numéro de projet Firebase"
												value={r.app.firebase.projectNumber}
												onChange={(e) =>
													updateFirebase(r.id, {
														projectNumber: e.target.value,
													})
												}
											/>
											<input
												className="otl-input"
												placeholder="App ID Firebase (1:…:android:…)"
												value={r.app.firebase.firebaseAppId}
												onChange={(e) =>
													updateFirebase(r.id, {
														firebaseAppId: e.target.value,
													})
												}
											/>
											<input
												className="otl-input"
												placeholder="Chemin du compte de service (JSON)"
												value={r.app.firebase.serviceAccountKeyPath}
												onChange={(e) =>
													updateFirebase(r.id, {
														serviceAccountKeyPath: e.target.value,
													})
												}
											/>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			<div className="otl-create__actions">
				<button type="button" className="otl-btn-primary" onClick={save}>
					Enregistrer les modifications
				</button>
				<button
					type="button"
					className="otl-tab"
					onClick={() => navigate("/projects")}
				>
					Annuler
				</button>
			</div>
		</div>
	);
}
