export interface Crumb {
	label: string;
	/** Route cible ; absent sur le crumb courant (non cliquable). */
	to?: string;
}

export interface BreadcrumbContext {
	projectName?: string;
	scenarioName?: string;
	groupName?: string;
}

const PROJETS: Crumb = { label: "Projets", to: "/projects" };
const SCENARIOS: Crumb = { label: "Scénarios", to: "/scenarios" };

/** Crumb « [Projet] » : nom réel si connu, sinon libellé générique. */
function projectCrumb(ctx: BreadcrumbContext): Crumb {
	return { label: ctx.projectName ?? "Projet", to: "/scenarios" };
}

/**
 * Résout un pathname en une liste de crumbs (pure, sans hook router).
 * Le dernier item (courant) n'a pas de `to`.
 */
export function buildCrumbs(
	pathname: string,
	ctx: BreadcrumbContext = {},
): Crumb[] {
	const path = pathname.replace(/\/+$/, "") || "/";

	// Racine projets
	if (path === "/projects" || path === "/") {
		return [{ label: "Projets" }];
	}
	if (path === "/projects/new") {
		return [PROJETS, { label: "Nouveau projet" }];
	}
	if (/^\/projects\/[^/]+\/environments$/.test(path)) {
		return [PROJETS, projectCrumb(ctx), { label: "Environnements" }];
	}

	// Scénarios (hub)
	if (path === "/scenarios") {
		return [PROJETS, projectCrumb(ctx), { label: "Scénarios" }];
	}
	if (path === "/scenarios/new") {
		return [
			PROJETS,
			projectCrumb(ctx),
			SCENARIOS,
			{ label: "Nouveau scénario" },
		];
	}
	if (path === "/scenarios/groups/new") {
		return [PROJETS, projectCrumb(ctx), SCENARIOS, { label: "Nouveau groupe" }];
	}
	if (/^\/scenarios\/groups\/[^/]+\/edit$/.test(path)) {
		return [
			PROJETS,
			projectCrumb(ctx),
			SCENARIOS,
			{ label: ctx.groupName ?? "Groupe" },
		];
	}

	// Historique
	if (path === "/reports") {
		return [PROJETS, projectCrumb(ctx), { label: "Historique" }];
	}

	// Écrans liés à un scénario (exécution / lot / rapport)
	const scenarioChild = (current: string): Crumb[] => [
		PROJETS,
		projectCrumb(ctx),
		SCENARIOS,
		{ label: ctx.scenarioName ?? "Scénario" },
		{ label: current },
	];
	if (/^\/run\/[^/]+$/.test(path)) {
		return scenarioChild("Exécution");
	}
	if (/^\/batch\/[^/]+$/.test(path)) {
		return scenarioChild("Lot");
	}
	if (/^\/report\/[^/]+$/.test(path)) {
		return scenarioChild("Rapport");
	}

	// Repli robuste : au minimum la racine
	return [{ label: "Projets" }];
}

/**
 * Cible du bouton « ‹ Retour » : le `to` de l'avant-dernier crumb.
 * `null` sur la racine `/projects` (pas de Retour).
 */
export function parentPath(pathname: string): string | null {
	const crumbs = buildCrumbs(pathname);
	const parent = crumbs.at(-2);
	return parent?.to ?? null;
}
