import type { Platform } from "../../shared/types";

const LABELS: Record<Platform, string> = {
	web: "Web",
	responsive: "Responsive",
	mobile: "Mobile",
};

export function PlatformIcon({
	platform,
	size = 16,
}: {
	platform: Platform;
	size?: number;
}): JSX.Element {
	const label = LABELS[platform];
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 2,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		role: "img" as const,
		"aria-label": label,
	};

	if (platform === "web") {
		// Globe: circle + single meridian (ISO maquette).
		return (
			<svg {...common}>
				<title>{label}</title>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
			</svg>
		);
	}
	if (platform === "responsive") {
		// Monitor: screen + stand.
		return (
			<svg {...common}>
				<title>{label}</title>
				<rect x="3" y="4" width="18" height="12" rx="1.5" />
				<path d="M9 20h6M12 16v4" />
			</svg>
		);
	}
	// Mobile: phone.
	return (
		<svg {...common}>
			<title>{label}</title>
			<rect x="6" y="2" width="12" height="20" rx="2.5" />
			<line x1="12" y1="18" x2="12.01" y2="18" />
		</svg>
	);
}
