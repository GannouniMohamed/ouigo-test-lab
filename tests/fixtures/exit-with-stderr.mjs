// Fixture pour tester runTool : écrit sur stderr et sort avec un code non nul.
// Shell-safe (chemin sans caractères spéciaux) → fiable sur Windows/macOS/Linux.
process.stderr.write("boom");
process.exit(3);
