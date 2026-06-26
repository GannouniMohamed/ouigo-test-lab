import { type ToolRunner, runTool } from "./exec";

const DEFAULT_INSTALL_CMD = "curl -fsSL https://get.maestro.mobile.dev | bash";

// Installe le Maestro CLI via le script officiel. Le seam OTL_MAESTRO_INSTALL_CMD
// permet des tests hermétiques (sans réseau). macOS/Linux (shell bash via sh -c).
export async function installMaestroCli(
	run: ToolRunner = runTool,
): Promise<{ ok: boolean; error?: string }> {
	const cmd = process.env.OTL_MAESTRO_INSTALL_CMD || DEFAULT_INSTALL_CMD;
	const { code, stderr } = await run("sh", ["-c", cmd]);
	if (code === 0) return { ok: true };
	return {
		ok: false,
		error: stderr.trim() || `Échec de l'installation (code ${code}).`,
	};
}
