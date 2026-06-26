import { describe, expect, it } from "vitest";
import { parseFlowSteps } from "../../src/shared/flow";

const FLOW = `appId: com.ouigo.app
---
- launchApp:
    clearState: true
- tapOn: "Connexion"
- inputText: "test@ouigo.com"
- assertVisible: "Bienvenue"
- stopApp
`;

describe("parseFlowSteps", () => {
	it("compte une étape par commande de premier niveau (pas les clés imbriquées)", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps).toHaveLength(5);
		expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
	});

	it("titre chaque étape avec le texte de la commande, sans le tiret", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps[0].title).toBe("launchApp:");
		expect(steps[1].title).toBe('tapOn: "Connexion"');
		expect(steps[4].title).toBe("stopApp");
	});

	it("ignore l'en-tête et le séparateur", () => {
		const steps = parseFlowSteps(FLOW);
		expect(steps.some((s) => s.title.includes("appId"))).toBe(false);
		expect(steps.some((s) => s.title === "---")).toBe(false);
	});

	it("renvoie [] pour un flow sans commande", () => {
		expect(parseFlowSteps("appId: com.ouigo.app\n---\n")).toEqual([]);
	});
});
