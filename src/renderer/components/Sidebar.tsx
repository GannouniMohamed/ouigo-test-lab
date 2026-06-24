import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface NavItem {
	label: string;
	icon: ReactNode;
	to: string;
	/** Routes (prefixes) for which this item is highlighted as active. */
	match: (path: string) => boolean;
}

const icons = {
	scenarios: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M12 3 21 8 12 13 3 8 12 3Z M3 12 12 17 21 12 M3 16 12 21 21 16"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	),
	exec: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M8 5 19 12 8 19 8 5Z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	),
	reports: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M5 21V10 M12 21V4 M19 21V14"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
		</svg>
	),
	projects: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	),
	ai: (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3L12 3Z"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
		</svg>
	),
};

const navItems: NavItem[] = [
	{
		label: "Projets",
		icon: icons.projects,
		to: "/projects",
		match: (p) => p === "/" || p.startsWith("/projects"),
	},
	{
		label: "Scénarios",
		icon: icons.scenarios,
		to: "/scenarios",
		match: (p) => p.startsWith("/scenarios"),
	},
	{
		label: "Exéc.",
		icon: icons.exec,
		to: "/scenarios",
		match: (p) => p.startsWith("/run"),
	},
	{
		label: "Rapports",
		icon: icons.reports,
		to: "/reports",
		match: (p) => p.startsWith("/reports") || p.startsWith("/report"),
	},
];

export function Sidebar(): JSX.Element {
	const { pathname } = useLocation();
	const navigate = useNavigate();

	return (
		<aside className="otl-sidebar">
			<div className="otl-sidebar__logo" aria-label="OuiTest">
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M5 12.5 10 17.5 19 7"
						stroke="#fff"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<nav className="otl-sidebar__nav">
				{navItems.map((item) => {
					const active = item.match(pathname);
					return (
						<button
							type="button"
							key={item.label}
							className={`otl-sidebar__item${active ? " active" : ""}`}
							onClick={() => navigate(item.to)}
						>
							<span className="otl-sidebar__icon">{item.icon}</span>
							<span className="otl-sidebar__label">{item.label}</span>
						</button>
					);
				})}
				<span
					className="otl-sidebar__item otl-sidebar__item--disabled"
					aria-disabled="true"
					title="Bientôt"
				>
					<span className="otl-sidebar__icon">{icons.ai}</span>
					<span className="otl-sidebar__label">IA</span>
				</span>
			</nav>
			<div className="otl-sidebar__avatar">PO</div>
		</aside>
	);
}
