import { existsSync } from "node:fs";
import type { DoctorCheck, MobileDoctorReport } from "../../shared/types";
import { listDevices } from "./devices";
import { type ToolRunner, maestroBin, runTool, toolBin } from "./exec";

const MIN_JAVA = 17;

// `maestro --version` crache une bannière (analytics, pubs « Analyze with AI »…)
// puis la version nue sur la dernière ligne. On extrait juste le semver pour
// l'afficher proprement (sinon toute la bannière s'affiche comme « version »).
export function parseMaestroVersion(out: string): string | undefined {
	const lines = out
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		if (/^\d+\.\d+(?:\.\d+)?$/.test(lines[i])) return lines[i];
	}
	const m = /\b(\d+\.\d+\.\d+)\b/.exec(out);
	return m ? m[1] : undefined;
}

// Extrait la version majeure depuis la sortie de `java -version`.
// Gère "17.0.8" → 17 et le legacy "1.8.0_x" → 8.
export function parseJavaMajor(versionOutput: string): number | null {
	const m = /version\s+"(\d+)(?:\.(\d+))?/.exec(versionOutput);
	if (!m) return null;
	const major = Number(m[1]);
	if (major === 1 && m[2]) return Number(m[2]); // 1.8 → 8
	return major;
}

// Emplacements probables de l'app Maestro Studio desktop par OS.
function studioPaths(): string[] {
	if (process.platform === "darwin")
		return ["/Applications/Maestro Studio.app"];
	if (process.platform === "win32")
		return [
			`${process.env.LOCALAPPDATA ?? ""}\\Programs\\Maestro Studio\\Maestro Studio.exe`,
		];
	return [`${process.env.HOME ?? ""}/.local/bin/maestro-studio`];
}

export async function mobileDoctor(deps?: {
	run?: ToolRunner;
	exists?: (p: string) => boolean;
}): Promise<MobileDoctorReport> {
	const run = deps?.run ?? runTool;
	const exists = deps?.exists ?? existsSync;

	// Java 17+ (`java -version` écrit sur stderr).
	const javaOut = await run(toolBin("java"), ["-version"]);
	const javaMajor = parseJavaMajor(javaOut.stderr || javaOut.stdout);
	const javaOk = javaMajor !== null && javaMajor >= MIN_JAVA;
	const java: DoctorCheck = {
		label: "Java 17+",
		ok: javaOk,
		version: javaMajor !== null ? String(javaMajor) : undefined,
		hint: javaOk
			? undefined
			: "Installe un JDK 17+ (ex. `brew install openjdk@17` ou Adoptium Temurin) et configure JAVA_HOME.",
	};

	// Maestro CLI
	const maestroOut = await run(maestroBin(exists), ["--version"]);
	const maestro: DoctorCheck = {
		label: "Maestro CLI",
		ok: maestroOut.code === 0,
		version:
			maestroOut.code === 0
				? parseMaestroVersion(maestroOut.stdout)
				: undefined,
		hint:
			maestroOut.code === 0
				? undefined
				: "Installe maestro : `curl -fsSL https://get.maestro.mobile.dev | bash`.",
	};

	// adb (Android SDK platform-tools)
	const adbOut = await run(toolBin("adb"), ["version"]);
	const adb: DoctorCheck = {
		label: "adb (Android SDK)",
		ok: adbOut.code === 0,
		version:
			adbOut.code === 0 ? adbOut.stdout.split("\n")[0]?.trim() : undefined,
		hint:
			adbOut.code === 0
				? undefined
				: "Installe l'Android SDK platform-tools et ajoute `adb` au PATH.",
	};

	// Maestro Studio desktop (présence du fichier)
	const studioOk = studioPaths().some((p) => exists(p));
	const studio: DoctorCheck = {
		label: "Maestro Studio (desktop)",
		ok: studioOk,
		hint: studioOk
			? undefined
			: "Installe l'app Maestro Studio desktop (nécessaire pour enregistrer un parcours).",
	};

	// Au moins un appareil/émulateur joignable
	const devices = await listDevices(run);
	const bootedCount = devices.filter((d) => d.state === "booted").length;
	const device: DoctorCheck = {
		label: "Appareil / émulateur",
		ok: bootedCount > 0,
		version: bootedCount > 0 ? `${bootedCount} dispo` : undefined,
		hint:
			bootedCount > 0
				? undefined
				: "Branche un téléphone (débogage USB activé) ou démarre un émulateur.",
	};

	const allOk = java.ok && maestro.ok && adb.ok && studio.ok && device.ok;
	return { allOk, java, maestro, adb, studio, device };
}
