// Converts a raw Playwright step title into a short, readable French label.
// Best-effort heuristic: always falls back to the (trimmed) raw string when no
// pattern matches, never throws, never returns a non-empty string for empty input.

const Q = "['\"]"; // single or double quote
const STR = `${Q}([^'"]*)${Q}`; // a quoted string, capturing its content

// Map a Playwright role to a French phrase. The {name} is already quoted.
const ROLE_LABELS: Record<string, string> = {
	button: "le bouton",
	link: "le lien",
	textbox: "le champ",
	checkbox: "la case",
	heading: "le titre",
};

function quote(text: string): string {
	return `« ${text.trim()} »`;
}

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

// Best-effort extraction of a target ({cible}) from a locator expression.
// Returns a French phrase (often quoted) or null when nothing is recognized.
function extractTarget(expr: string): string | null {
	const role = new RegExp(
		`getByRole\\(\\s*${STR}\\s*(?:,\\s*\\{[^}]*name\\s*:\\s*${STR})?`,
		"i",
	).exec(expr);
	if (role) {
		const roleName = role[1].toLowerCase().trim();
		const name = role[2];
		const label = ROLE_LABELS[roleName];
		if (label) return name ? `${label} ${quote(name)}` : label;
		return name ? quote(name) : roleName;
	}

	const labelOrPlaceholder = new RegExp(
		`getBy(?:Label|Placeholder)\\(\\s*${STR}`,
		"i",
	).exec(expr);
	if (labelOrPlaceholder) return `le champ ${quote(labelOrPlaceholder[1])}`;

	const textOrTestId = new RegExp(
		`getBy(?:Text|TestId)\\(\\s*${STR}`,
		"i",
	).exec(expr);
	if (textOrTestId) return quote(textOrTestId[1]);

	const locator = new RegExp(`locator\\(\\s*${STR}`, "i").exec(expr);
	if (locator) return quote(locator[1]);

	return null;
}

export function humanizeStep(raw: string): string {
	const input = collapse(raw ?? "");
	if (!input) return "";

	// If it doesn't look like code at all, return it unchanged.
	const looksLikeCode =
		/[.()]/.test(input) && /(page|expect|getBy|locator)/i.test(input);
	if (!looksLikeCode) return input;

	// --- Assertions: expect(...).matcher(...) ---
	const expectMatch = /expect\(([\s\S]*)\)\s*\.\s*(\w+)\s*\(([\s\S]*)\)/i.exec(
		input,
	);
	if (expectMatch) {
		const [, subject, matcher, args] = expectMatch;
		const m = matcher.toLowerCase();
		const argStr = new RegExp(`^\\s*${STR}`).exec(args)?.[1];
		const target = extractTarget(subject);

		if (m === "tohavetext" || m === "tocontaintext") {
			if (argStr !== undefined) return `Vérifier le texte ${quote(argStr)}`;
		}
		if (m === "tohaveurl") {
			if (argStr !== undefined) return `Vérifier l'URL ${quote(argStr)}`;
		}
		if (m === "tobevisible") {
			return `Vérifier que ${target ?? "l'élément"} est visible`;
		}
		if (m === "tobechecked") {
			return `Vérifier que ${target ?? "l'élément"} est coché`;
		}
		return `Vérifier ${target ?? "l'élément"}`;
	}

	// --- page.goto(...) ---
	if (/page\s*\.\s*goto\s*\(/i.test(input)) return "Ouvrir la page";

	// --- Actions: locator.action(args) — match the trailing action call ---
	const actionMatch =
		/\.\s*(click|fill|type|press|check|selectOption)\s*\(([\s\S]*)\)\s*$/i.exec(
			input,
		);
	if (actionMatch) {
		const action = actionMatch[1].toLowerCase();
		const args = actionMatch[2];
		const argStr = new RegExp(`^\\s*${STR}`).exec(args)?.[1];
		// The locator part is everything before the trailing action call.
		const locatorExpr = input.slice(0, actionMatch.index);
		const target = extractTarget(locatorExpr);

		if (action === "click") return target ? `Cliquer sur ${target}` : "Cliquer";
		if (action === "fill" || action === "type") {
			return argStr !== undefined ? `Saisir ${quote(argStr)}` : "Saisir";
		}
		if (action === "press") {
			return argStr !== undefined ? `Appuyer sur ${quote(argStr)}` : "Appuyer";
		}
		if (action === "check") return target ? `Cocher ${target}` : "Cocher";
		if (action === "selectoption") {
			return target ? `Sélectionner ${target}` : "Sélectionner";
		}
	}

	// Nothing matched — safe fallback to the original (trimmed) string.
	return input;
}
