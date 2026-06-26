import { describe, expect, it } from "vitest";
import { rebaseFlowAppId } from "../../src/shared/flow";

const FLOW = `appId: com.example.recorded
---
- launchApp:
    clearState: true
- tapOn: "Connexion"
`;

describe("rebaseFlowAppId", () => {
	it("remplace l'appId de l'en-tête par celui de l'env actif", () => {
		const out = rebaseFlowAppId(FLOW, "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).not.toContain("com.example.recorded");
		// le corps reste intact
		expect(out).toContain('- tapOn: "Connexion"');
		expect(out).toContain("clearState: true");
	});

	it("ne touche pas un override appId dans le corps (après ---)", () => {
		const flow = `appId: com.example.recorded
---
- launchApp:
    appId: com.other.override
`;
		const out = rebaseFlowAppId(flow, "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).toContain("appId: com.other.override");
	});

	it("no-op quand appId est vide", () => {
		expect(rebaseFlowAppId(FLOW, "")).toBe(FLOW);
	});

	it("préfixe un en-tête appId quand le flow n'en a pas", () => {
		const flow = `---
- launchApp
`;
		const out = rebaseFlowAppId(flow, "com.ouigo.app");
		expect(out.startsWith("appId: com.ouigo.app\n")).toBe(true);
	});
});
