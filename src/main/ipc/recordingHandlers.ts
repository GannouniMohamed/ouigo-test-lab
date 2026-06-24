import type { Platform, Scenario } from "../../shared/types";
import { playwrightRecorder } from "../recorder/playwrightRecorder";

export interface StartRecordingOpts {
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
	platform?: Platform;
}

export function handleStartRecording(
	opts: StartRecordingOpts,
): Promise<{ recordingId: string }> {
	return playwrightRecorder.startRecording(opts);
}
export function handleStopRecording(recordingId: string): Promise<Scenario> {
	return playwrightRecorder.stopRecording(recordingId);
}
