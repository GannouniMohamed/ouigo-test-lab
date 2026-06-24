export function formatAt(at?: string): string {
	if (!at) return "—";
	return new Date(at).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatDuration(ms?: number): string {
	if (ms == null) return "—";
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateOnly(d: Date): string {
	return d.toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

// Relative time in French. `now` is an epoch-ms override for deterministic tests.
export function formatRelative(at?: string, now?: number): string {
	if (!at) return "—";
	const then = Date.parse(at);
	if (Number.isNaN(then)) return "—";
	const ref = now ?? Date.now();
	const diffMs = ref - then;
	const min = Math.floor(diffMs / 60_000);
	if (min < 1) return "à l'instant";
	if (min < 60) return `il y a ${min} min`;
	const hours = Math.floor(min / 60);
	if (hours < 24) return `il y a ${hours} h`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "hier";
	if (days <= 7) return `il y a ${days} j`;
	return formatDateOnly(new Date(then));
}
