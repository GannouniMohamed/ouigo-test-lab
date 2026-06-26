import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

// Un runner d'outil CLI injectable : permet de tester devices.ts/doctor.ts avec
// des sorties canned, sans vrai binaire ni appareil.
export type ToolRunner = (bin: string, args: string[]) => Promise<ExecResult>;

const isWindows = process.platform === "win32";

// Sous shell:true (Windows), Node passe `bin args.join(" ")` à cmd.exe SANS
// citer les arguments → un chemin avec espaces (ex. C:\Users\John Doe\...apk)
// serait découpé. On cite donc un token pour cmd.exe.
export function quoteForCmd(s: string): string {
	return `"${s.replace(/"/g, '\\"')}"`;
}

// Ne cite QUE les arguments contenant une espace : citer un drapeau sans espace
// (ex. "-version") perturbe cmd.exe et peut faire échouer/bloquer la commande.
export function quoteArgForCmd(s: string): string {
	return /\s/.test(s) ? quoteForCmd(s) : s;
}

// Implémentation réelle. Ne rejette JAMAIS : un binaire absent est un état
// normal du doctor (code -1), pas une exception.
export const runTool: ToolRunner = (bin, args) =>
	new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (r: ExecResult) => {
			if (settled) return;
			settled = true;
			resolve(r);
		};
		try {
			// Sur Windows on passe par cmd.exe (shell:true) pour résoudre les
			// binaires sans extension via PATHEXT ; on cite le binaire ET chaque
			// argument pour gérer les chemins avec espaces (ex. APK sous un profil
			// utilisateur « C:\Users\John Doe\... »).
			const child = spawn(
				isWindows ? quoteForCmd(bin) : bin,
				isWindows ? args.map(quoteArgForCmd) : args,
				{ shell: isWindows },
			);
			child.stdout?.on("data", (b: Buffer) => {
				stdout += b.toString();
			});
			child.stderr?.on("data", (b: Buffer) => {
				stderr += b.toString();
			});
			child.on("error", (err) =>
				finish({ code: -1, stdout, stderr: stderr || String(err) }),
			);
			child.on("close", (code) => finish({ code: code ?? 0, stdout, stderr }));
		} catch (err) {
			finish({ code: -1, stdout: "", stderr: String(err) });
		}
	});

// Résout le binaire d'un outil : override d'env OTL_<NAME>_BIN sinon le nom nu.
export function toolBin(name: "java" | "maestro" | "adb"): string {
	return process.env[`OTL_${name.toUpperCase()}_BIN`] || name;
}

// Résout le binaire maestro. Le script d'install le pose dans ~/.maestro/bin,
// hors du PATH du process Electron — on le retrouve donc explicitement pour que
// la re-vérification passe juste après une install, sans relancer l'app.
export function maestroBin(
	exists: (p: string) => boolean = existsSync,
): string {
	const override = process.env.OTL_MAESTRO_BIN;
	if (override) return override;
	const local = join(homedir(), ".maestro", "bin", "maestro");
	if (exists(local)) return local;
	return "maestro";
}
