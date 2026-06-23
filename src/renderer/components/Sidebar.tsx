import { NavLink } from "react-router-dom";

export function Sidebar(): JSX.Element {
	return (
		<aside className="otl-sidebar">
			<nav className="otl-sidebar__nav">
				<NavLink
					to="/scenarios"
					className={({ isActive }) =>
						`otl-sidebar__item${isActive ? " active" : ""}`
					}
				>
					Scénarios
				</NavLink>
				<NavLink
					to="/scenarios"
					className={({ isActive }) =>
						`otl-sidebar__item${isActive ? " active" : ""}`
					}
				>
					Exéc.
				</NavLink>
				<NavLink
					to="/reports"
					className={({ isActive }) =>
						`otl-sidebar__item${isActive ? " active" : ""}`
					}
				>
					Rapports
				</NavLink>
				<span
					className="otl-sidebar__item otl-sidebar__item--disabled"
					aria-disabled="true"
					title="Bientôt"
				>
					IA
				</span>
			</nav>
			<div className="otl-sidebar__avatar">PO</div>
		</aside>
	);
}
