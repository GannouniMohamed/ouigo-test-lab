import type { Environment, FirebaseAppDistConfig } from "../../shared/types";
import { type ToolRunner, runTool, toolBin } from "./exec";
import { type FirebaseDeps, pullLatestApk } from "./firebase";

export interface EnsureDeps {
	run?: ToolRunner;
	pull?: (cfg: FirebaseAppDistConfig, fdeps?: FirebaseDeps) => Promise<string>;
	firebase?: FirebaseDeps;
}

// Garantit que l'app est prête sur l'appareil avant le run :
//  - "installed" : supposée présente → no-op.
//  - "firebase"  : récupère le dernier APK puis `adb -s <device> install -r`.
// Ne lève jamais : renvoie un résultat discriminé à message français.
export async function ensureAppOnDevice(
	env: Environment,
	deviceId: string,
	deps?: EnsureDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const app = env.app;
	if (!app) return { ok: false, error: "Aucune application configurée." };
	if (app.source === "installed") return { ok: true };

	if (!app.firebase)
		return {
			ok: false,
			error: "Configuration Firebase manquante pour cet environnement.",
		};

	const run = deps?.run ?? runTool;
	const pull = deps?.pull ?? pullLatestApk;

	let apkPath: string;
	try {
		apkPath = await pull(app.firebase, deps?.firebase);
	} catch (err) {
		return {
			ok: false,
			error: `Firebase : ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const res = await run(toolBin("adb"), [
		"-s",
		deviceId,
		"install",
		"-r",
		apkPath,
	]);
	if (res.code !== 0)
		return {
			ok: false,
			error: `Échec de l'installation de l'APK : ${res.stderr.trim() || res.stdout.trim() || `adb a quitté (code ${res.code})`}`,
		};
	return { ok: true };
}
