import type { RecordedStep } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Moteur de flow Maestro (mobile) : helpers de texte purs, parallèles à
// src/shared/spec.ts (Playwright). Un flow est un document YAML : un en-tête
// (`appId:` + options) puis `---` puis une liste de commandes. On manipule le
// flow comme du texte, sans dépendance YAML (le module est bundlé dans le main
// Electron).
// ───────────────────────────────────────────────────────────────────────────

const APPID_RE = /^appId:\s*.*$/;
const SEPARATOR_RE = /^---\s*$/;

// Réécrit la ligne `appId:` de l'en-tête (avant le premier `---`) vers `appId`.
// N'altère pas un override `appId:` situé dans le corps (ex. sous launchApp).
// Parallèle de rebaseSpecUrls : switcher d'env switche l'app sous test.
export function rebaseFlowAppId(flow: string, appId: string): string {
	if (!appId) return flow;
	const lines = flow.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (SEPARATOR_RE.test(lines[i])) break; // fin de l'en-tête
		if (APPID_RE.test(lines[i])) {
			lines[i] = `appId: ${appId}`;
			return lines.join("\n");
		}
	}
	// Pas d'appId dans l'en-tête : on en préfixe un.
	return `appId: ${appId}\n${flow}`;
}

// Item de commande de premier niveau : `- ` en colonne 0 (sans indentation).
const TOP_LEVEL_ITEM_RE = /^-\s+(.*)$/;

// Parse la liste de commandes (après `---`) en étapes, une par commande de
// premier niveau. Le titre est le texte de la commande sans le tiret de tête.
// Parallèle de parseRecordedSteps : alimente recordedStepCount.
export function parseFlowSteps(flow: string): RecordedStep[] {
	const lines = flow.split("\n");
	const sepIndex = lines.findIndex((l) => SEPARATOR_RE.test(l));
	const body = sepIndex === -1 ? lines : lines.slice(sepIndex + 1);
	const steps: RecordedStep[] = [];
	for (const line of body) {
		const m = TOP_LEVEL_ITEM_RE.exec(line);
		if (!m) continue;
		steps.push({ index: steps.length, title: m[1].trim() });
	}
	return steps;
}
