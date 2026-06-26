// Fausse CLI Maestro pour tester maestroRunner sans appareil réel.
// Émule `maestro [--device X] test --format junit --output <xml> --debug-output <dir> <flow>`.
// OTL_FAKE_MAESTRO_FAIL=1 → produit un run en échec.
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--output");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
const fail = process.env.OTL_FAKE_MAESTRO_FAIL === "1";

// OTL_FAKE_MAESTRO_SLEEP=1 → reste vivant (pour tester cancel()).
if (process.env.OTL_FAKE_MAESTRO_SLEEP === "1") {
	process.stdout.write("  ✅  Launch app\n");
	setTimeout(() => process.exit(0), 60000);
} else if (fail) {
	process.stdout.write("  ✅  Launch app\n");
	process.stdout.write("  ❌  Assert visible\n");
	if (outPath)
		writeFileSync(
			outPath,
			'<testsuites><testsuite failures="1"><testcase name="f"><failure>échec assertion</failure></testcase></testsuite></testsuites>',
		);
	process.exit(1);
} else {
	process.stdout.write("  ✅  Launch app\n");
	process.stdout.write("  ✅  Assert visible\n");
	if (outPath)
		writeFileSync(
			outPath,
			'<testsuites><testsuite failures="0"><testcase name="f"/></testsuite></testsuites>',
		);
	process.exit(0);
}
