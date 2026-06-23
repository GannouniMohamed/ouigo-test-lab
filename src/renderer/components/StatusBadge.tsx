export function StatusBadge({
	status,
}: { status: "passed" | "failed" | "never" }): JSX.Element {
	const labels: Record<typeof status, string> = {
		passed: "Réussi",
		failed: "Échec",
		never: "Jamais exécuté",
	};

	return (
		<span className={`otl-badge otl-badge--${status}`}>
			<span className="otl-badge__dot" />
			<span className="otl-badge__label">{labels[status]}</span>
		</span>
	);
}
