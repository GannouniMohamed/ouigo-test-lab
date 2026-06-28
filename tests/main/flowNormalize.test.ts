import { describe, expect, it } from "vitest";
import { normalizeFlow, parseFlowSteps } from "../../src/shared/flow";

describe("normalizeFlow", () => {
	it("commands-only (Studio Copy) → ajoute l'en-tête appId + ---", () => {
		const raw = "- tapOn:\n    id: a\n- tapOn: Bordeaux\n";
		const out = normalizeFlow(raw, "com.ouigo.app");
		expect(out).toBe(
			"appId: com.ouigo.app\n---\n- tapOn:\n    id: a\n- tapOn: Bordeaux\n",
		);
		expect(parseFlowSteps(out).length).toBe(2);
	});

	it("flow déjà complet → rebase l'appId, un seul ---", () => {
		const raw = "appId: ancien\n---\n- launchApp\n- tapOn: X\n";
		const out = normalizeFlow(raw, "com.new");
		expect(out).toBe("appId: com.new\n---\n- launchApp\n- tapOn: X\n");
		expect((out.match(/^---$/gm) || []).length).toBe(1);
	});

	it("appId mais pas de --- (bug latent) → insère le séparateur", () => {
		const raw = "appId: ancien\n- tapOn: X\n";
		const out = normalizeFlow(raw, "com.new");
		expect(out).toBe("appId: com.new\n---\n- tapOn: X\n");
	});

	it("entrée vide → corps vide (0 étape, le garde-fou appelant rejette)", () => {
		expect(parseFlowSteps(normalizeFlow("   ", "com.x")).length).toBe(0);
	});

	it("CRLF normalisé", () => {
		const out = normalizeFlow("- tapOn: A\r\n- tapOn: B\r\n", "com.x");
		expect(out).toBe("appId: com.x\n---\n- tapOn: A\n- tapOn: B\n");
	});
});
