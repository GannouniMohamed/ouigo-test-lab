import type { MobileDevice } from "../../shared/types";
import { type ToolRunner, maestroBin, runTool, toolBin } from "./exec";

// États possibles de la 2e colonne de `adb devices`. Sert à distinguer une
// vraie ligne d'appareil du bruit de démarrage du daemon (`* daemon ...`) ou de
// toute autre ligne hors format.
const ADB_STATES = new Set([
	"device",
	"offline",
	"unauthorized",
	"authorizing",
	"connecting",
	"bootloader",
	"recovery",
	"sideload",
	"host",
	"no", // "no permissions; see ..."
]);

// Extrait la valeur d'un champ `clé:valeur` d'une ligne `adb devices -l`.
function field(rest: string, key: string): string | undefined {
	const m = new RegExp(`${key}:(\\S+)`).exec(rest);
	return m ? m[1] : undefined;
}

// Liste les appareils/émulateurs Android via `adb devices -l`. Source la plus
// stable et parsable pour la v1. Ne lève jamais : renvoie [] en cas d'échec.
export async function listDevices(
	run: ToolRunner = runTool,
): Promise<MobileDevice[]> {
	const { code, stdout } = await run(toolBin("adb"), ["devices", "-l"]);
	if (code !== 0) return [];

	const devices: MobileDevice[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		// Ignore l'en-tête et le bruit de démarrage du daemon (`* daemon ...`).
		if (
			!trimmed ||
			trimmed.startsWith("List of devices") ||
			trimmed.startsWith("*")
		)
			continue;
		const [id, status, ...rest] = trimmed.split(/\s+/);
		// N'accepte qu'une vraie ligne d'appareil : 2e colonne = état adb connu.
		if (!id || !status || !ADB_STATES.has(status)) continue;
		const restStr = rest.join(" ");
		const model = field(restStr, "model");
		devices.push({
			id,
			name: model ? model.replace(/_/g, " ") : id,
			kind: id.startsWith("emulator-") ? "emulator" : "physical",
			state: status === "device" ? "booted" : "offline",
		});
	}
	return devices;
}

// Démarre un émulateur Android via Maestro (gère la création/boot de l'AVD par
// défaut). Long : Maestro résout une fois l'appareil booté.
export async function startDevice(
	run: ToolRunner = runTool,
): Promise<{ ok: boolean; error?: string }> {
	const { code, stderr } = await run(maestroBin(), [
		"start-device",
		"--platform",
		"android",
	]);
	if (code === 0) return { ok: true };
	return {
		ok: false,
		error: stderr.trim() || `maestro a quitté (code ${code})`,
	};
}
