import type React from "react";
import { useEffect, useState } from "react";

type Phase = "checking" | "installing" | "ready";

export function AppGate({
	children,
}: { children: React.ReactNode }): JSX.Element {
	const [phase, setPhase] = useState<Phase>("checking");

	useEffect(() => {
		let cancelled = false;
		async function check() {
			const ready = await window.api.browsersReady();
			if (cancelled) return;
			if (ready) {
				setPhase("ready");
			} else {
				setPhase("installing");
			}
		}
		void check();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (phase !== "installing") return;
		let cancelled = false;
		async function install() {
			await window.api.installBrowsers();
			if (!cancelled) setPhase("ready");
		}
		void install();
		return () => {
			cancelled = true;
		};
	}, [phase]);

	if (phase === "checking") {
		return <div>Préparation…</div>;
	}

	if (phase === "installing") {
		return (
			<>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					Installation des navigateurs
				</div>
				<p>Première utilisation — téléchargement de Chromium…</p>
			</>
		);
	}

	return <>{children}</>;
}
