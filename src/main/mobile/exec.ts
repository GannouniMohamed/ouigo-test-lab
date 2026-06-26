import { spawn } from "node:child_process";

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

// Un runner d'outil CLI injectable : permet de tester devices.ts/doctor.ts avec
// des sorties canned, sans vrai binaire ni appareil.
export type ToolRunner = (bin: string, args: string[]) => Promise<ExecResult>;

const isWindows = process.platform === "win32";

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
			const child = spawn(bin, args, { shell: isWindows });
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
