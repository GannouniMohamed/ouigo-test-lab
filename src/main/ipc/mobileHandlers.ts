import type { MobileDevice, MobileDoctorReport } from "../../shared/types";
import { listDevices, startDevice } from "../mobile/devices";
import { mobileDoctor } from "../mobile/doctor";
import { installMaestroCli } from "../mobile/installers";

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
