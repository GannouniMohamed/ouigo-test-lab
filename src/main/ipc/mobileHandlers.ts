import type { MobileDevice, MobileDoctorReport } from "../../shared/types";
import { listDevices, startDevice } from "../mobile/devices";
import { mobileDoctor } from "../mobile/doctor";
import { ensureAppOnDevice } from "../mobile/ensureAppOnDevice";
import { installMaestroCli } from "../mobile/installers";
import { getEnvironment } from "../stores/projectStore";

export function handleMobileDoctor(): Promise<MobileDoctorReport> {
	return mobileDoctor();
}

export function handleListDevices(): Promise<MobileDevice[]> {
	return listDevices();
}

export function handleStartDevice(): Promise<{ ok: boolean; error?: string }> {
	return startDevice();
}

export function handleInstallMaestro(): Promise<{
	ok: boolean;
	error?: string;
}> {
	return installMaestroCli();
}

// Installe l'app de l'environnement sur l'appareil (no-op si source "installed",
// pull Firebase + `adb install -r` si source "firebase"). Ne lève jamais.
export async function handleInstallApp(
	projectId: string,
	environmentId: string,
	deviceId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const env = getEnvironment(projectId, environmentId);
		return await ensureAppOnDevice(env, deviceId);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
