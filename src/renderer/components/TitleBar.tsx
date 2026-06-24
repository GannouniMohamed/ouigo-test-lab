import type { CSSProperties } from "react";
import { useLocation } from "react-router-dom";

// `-webkit-app-region` is not in the standard CSSProperties type.
const drag = { WebkitAppRegion: "drag" } as CSSProperties;
const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties;

function pageTitle(pathname: string): string {
	if (pathname.startsWith("/scenarios/new")) return "Nouveau scénario";
	if (pathname.startsWith("/scenarios")) return "Hub de tests E2E";
	if (pathname.startsWith("/run")) return "Exécution en cours";
	if (pathname.startsWith("/report")) return "Rapport d'exécution";
	if (pathname.startsWith("/reports")) return "Rapports";
	if (pathname.startsWith("/projects")) return "Projets";
	return "Ouigo Test Lab";
}

export function TitleBar(): JSX.Element {
	const { pathname } = useLocation();
	const title = pageTitle(pathname);
	// Only Windows gets the custom min/max/close controls. macOS (native traffic
	// lights) and any unknown platform render the controls-free centered bar, so
	// we never accidentally show Windows controls on macOS.
	const isWindows = window.api?.platform === "win32";

	if (!isWindows) {
		// macOS: native traffic lights are drawn by the OS; we provide a
		// draggable bar with the centered title and left room for the lights.
		return (
			<div className="otl-titlebar otl-titlebar--mac" style={drag}>
				<div className="otl-titlebar__title">
					<span className="otl-wordmark">OuiTest</span>
					<span className="otl-titlebar__sep">—</span>
					<span>{title}</span>
				</div>
			</div>
		);
	}

	// Windows / Linux: frameless — draw the icon + title on the left and the
	// Fluent-style window controls on the right.
	return (
		<div className="otl-titlebar otl-titlebar--win" style={drag}>
			<div className="otl-titlebar__left">
				<span className="otl-titlebar__logo" aria-hidden="true" />
				<span className="otl-wordmark">OuiTest</span>
				<span className="otl-titlebar__sep">—</span>
				<span>{title}</span>
			</div>
			<div className="otl-titlebar__controls" style={noDrag}>
				<button
					type="button"
					className="otl-wc"
					aria-label="Réduire"
					onClick={() => window.api.windowControls.minimize()}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
						<rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
					</svg>
				</button>
				<button
					type="button"
					className="otl-wc"
					aria-label="Agrandir"
					onClick={() => window.api.windowControls.maximize()}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
						<rect
							x="0.5"
							y="0.5"
							width="9"
							height="9"
							fill="none"
							stroke="currentColor"
						/>
					</svg>
				</button>
				<button
					type="button"
					className="otl-wc otl-wc--close"
					aria-label="Fermer"
					onClick={() => window.api.windowControls.close()}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
						<path
							d="M0 0 L10 10 M10 0 L0 10"
							stroke="currentColor"
							strokeWidth="1"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
