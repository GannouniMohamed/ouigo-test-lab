import { describe, expect, it } from "vitest";
import { listDevices, startDevice } from "../../src/main/mobile/devices";
import type { ExecResult } from "../../src/main/mobile/exec";

const ADB_OUT = `List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:Pixel_6 device:emu64a transport_id:1
1A2B3C4D5E             device product:raven model:Pixel_6_Pro device:raven transport_id:2
ZY22FGH7KK             offline
`;

function fakeRun(
	out: string,
): (bin: string, args: string[]) => Promise<ExecResult> {
	return async () => ({ code: 0, stdout: out, stderr: "" });
}

describe("listDevices", () => {
	it("parse les appareils adb (id, état, type, nom de modèle)", async () => {
		const devices = await listDevices(fakeRun(ADB_OUT));
		expect(devices).toHaveLength(3);

		const emu = devices[0];
		expect(emu.id).toBe("emulator-5554");
		expect(emu.state).toBe("booted");
		expect(emu.kind).toBe("emulator");
		expect(emu.name).toBe("Pixel 6"); // model:Pixel_6 → underscores en espaces

		const phys = devices[1];
		expect(phys.id).toBe("1A2B3C4D5E");
		expect(phys.kind).toBe("physical");
		expect(phys.name).toBe("Pixel 6 Pro");

		const off = devices[2];
		expect(off.id).toBe("ZY22FGH7KK");
		expect(off.state).toBe("offline");
		expect(off.name).toBe("ZY22FGH7KK"); // pas de model → fallback sur l'id
	});

	it("renvoie [] quand aucun appareil n'est attaché", async () => {
		const devices = await listDevices(fakeRun("List of devices attached\n\n"));
		expect(devices).toEqual([]);
	});

	it("renvoie [] si adb est introuvable (code -1)", async () => {
		const devices = await listDevices(async () => ({
			code: -1,
			stdout: "",
			stderr: "not found",
		}));
		expect(devices).toEqual([]);
	});

	it("ignore le bruit de démarrage du daemon adb (lignes '*')", async () => {
		const out = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
emulator-5554          device model:Pixel_6
`;
		const devices = await listDevices(fakeRun(out));
		expect(devices).toHaveLength(1);
		expect(devices[0].id).toBe("emulator-5554");
	});

	it("mappe un appareil 'unauthorized' en offline (pas booted)", async () => {
		const out = `List of devices attached
ABCD1234               unauthorized
`;
		const devices = await listDevices(fakeRun(out));
		expect(devices).toHaveLength(1);
		expect(devices[0].state).toBe("offline");
	});
});

describe("startDevice", () => {
	it("invoque `maestro start-device --platform android` et renvoie ok", async () => {
		let calledBin = "";
		let calledArgs: string[] = [];
		const res = await startDevice(async (bin, args) => {
			calledBin = bin;
			calledArgs = args;
			return { code: 0, stdout: "Device started", stderr: "" };
		});
		expect(calledBin).toBe("maestro");
		expect(calledArgs).toEqual(["start-device", "--platform", "android"]);
		expect(res.ok).toBe(true);
	});

	it("renvoie ok=false + message si le boot échoue", async () => {
		const res = await startDevice(async () => ({
			code: 1,
			stdout: "",
			stderr: "no avd configured",
		}));
		expect(res.ok).toBe(false);
		expect(res.error).toContain("no avd configured");
	});
});
