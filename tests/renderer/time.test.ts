import { describe, expect, it } from "vitest";
import { formatDuration, formatRelative } from "../../src/renderer/lib/time";

const NOW = Date.parse("2026-06-24T12:00:00.000Z");

describe("formatRelative", () => {
	it("retourne — quand absent", () => {
		expect(formatRelative(undefined, NOW)).toBe("—");
	});
	it("à l'instant pour < 1 min", () => {
		expect(formatRelative("2026-06-24T11:59:30.000Z", NOW)).toBe("à l'instant");
	});
	it("minutes", () => {
		expect(formatRelative("2026-06-24T11:55:00.000Z", NOW)).toBe(
			"il y a 5 min",
		);
	});
	it("heures", () => {
		expect(formatRelative("2026-06-24T09:00:00.000Z", NOW)).toBe("il y a 3 h");
	});
	it("hier", () => {
		expect(formatRelative("2026-06-23T10:00:00.000Z", NOW)).toBe("hier");
	});
	it("jours", () => {
		expect(formatRelative("2026-06-21T12:00:00.000Z", NOW)).toBe("il y a 3 j");
	});
	it("au-delà de 7 jours bascule en date absolue", () => {
		const out = formatRelative("2026-06-10T12:00:00.000Z", NOW);
		expect(out).toMatch(/10\/06\/2026/);
	});
});

describe("formatDuration", () => {
	it("— quand absent", () => {
		expect(formatDuration(undefined)).toBe("—");
	});
	it("secondes", () => {
		expect(formatDuration(1234)).toBe("1.2s");
	});
});
