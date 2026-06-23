import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/main",
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/preload",
		},
	},
	renderer: {
		root: resolve(__dirname, "src/renderer"),
		build: {
			outDir: "out/renderer",
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
		plugins: [react()],
	},
});
