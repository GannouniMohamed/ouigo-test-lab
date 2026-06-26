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

	it("remplace l'appId même avec des fins de ligne CRLF (pas de doublon)", () => {
		const crlf = "appId: com.example.recorded\r\n---\r\n- launchApp\r\n";
		const out = rebaseFlowAppId(crlf, "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).not.toContain("com.example.recorded");
		// exactement un en-tête appId — pas de doublon préfixé
		expect(out.match(/^appId:/gm) ?? []).toHaveLength(1);
	});

	it("remplace l'appId d'en-tête même sans séparateur ---", () => {
		const out = rebaseFlowAppId("appId: old\n- launchApp\n", "com.ouigo.app");
		expect(out).toContain("appId: com.ouigo.app");
		expect(out).not.toContain("appId: old");
	});
});
