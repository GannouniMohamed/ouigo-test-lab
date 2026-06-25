import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
	type BreadcrumbContext,
	buildCrumbs,
	parentPath,
} from "../lib/breadcrumb";
import { useAppStore } from "../store";
import { Select } from "./Select";

const MAX_LABEL = 28;

function truncate(label: string): string {
	if (label.length <= MAX_LABEL) return label;
	return `${label.slice(0, MAX_LABEL - 1).trimEnd()}…`;
}

export function Breadcrumb(): JSX.Element {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const params = useParams();
	const projects = useAppStore((s) => s.projects);
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
	const scenarios = useAppStore((s) => s.scenarios);

	const projectName = projects.find((p) => p.id === activeProjectId)?.name;

	// Nom du groupe pour les routes de groupe (param `tunnelId`).
	const groupScenario = params.tunnelId
		? scenarios.find((s) => s.tunnelId === params.tunnelId)
		: undefined;

	const ctx: BreadcrumbContext = {
		projectName,
		groupName: groupScenario?.name,
	};

	const crumbs = buildCrumbs(pathname, ctx);
	const back = parentPath(pathname);

	return (
		<nav className="otl-breadcrumb" aria-label="Fil d'Ariane">
			{back !== null && (
				<button
					type="button"
					className="otl-backbtn"
					onClick={() => navigate(back)}
				>
					‹ Retour
				</button>
			)}
			<ol className="otl-breadcrumb__list">
				{crumbs.map((crumb, i) => {
					const isLast = i === crumbs.length - 1;
					const label = truncate(crumb.label);
					return (
						<li className="otl-breadcrumb__item" key={`${crumb.label}-${i}`}>
							{i > 0 && (
								<span className="otl-breadcrumb__sep" aria-hidden="true">
									›
								</span>
							)}
							{crumb.kind === "project" ? (
								<Select
									ariaLabel="Projet actif"
									value={activeProjectId}
									onChange={(id) => setActiveProjectId(id)}
									options={projects.map((p) => ({
										value: p.id,
										label: p.name,
									}))}
									className="otl-breadcrumb__project"
								/>
							) : crumb.to && !isLast ? (
								<button
									type="button"
									className="otl-breadcrumb__link"
									onClick={() => navigate(crumb.to as string)}
									title={crumb.label}
								>
									{label}
								</button>
							) : (
								<span
									className="otl-breadcrumb__current"
									aria-current={isLast ? "page" : undefined}
									title={crumb.label}
								>
									{label}
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
