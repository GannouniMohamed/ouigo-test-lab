import type { Platform, Scenario } from "../../shared/types";
import { maestroRecorder } from "../recorder/maestroRecorder";
import { playwrightRecorder } from "../recorder/playwrightRecorder";

export interface StartRecordingOpts {
	name: string;
	browser: "chromium" | "firefox" | "webkit";
	environmentId: string;
	projectId: string;
	tunnelId: string;
	platform?: Platform;
	deviceId?: string;
}

// Suit quel recorder possède chaque recordingId (le stop ne reçoit que l'id).
const recorderByRecording = new Map<string, "mobile" | "web">();

export async function handleStartRecording(
	opts: StartRecordingOpts,
): Promise<{ recordingId: string }> {
	if (opts.platform === "mobile") {
		const r = await maestroRecorder.startRecording(opts);
		recorderByRecording.set(r.recordingId, "mobile");
		return r;
	}
	const r = await playwrightRecorder.startRecording(opts);
	recorderByRecording.set(r.recordingId, "web");
	return r;
}

export async function handleStopRecording(
	recordingId: string,
	pastedFlow?: string,
): Promise<Scenario> {
	const kind = recorderByRecording.get(recordingId);
	recorderByRecording.delete(recordingId);
	return kind === "mobile"
		? maestroRecorder.stopRecording(recordingId, pastedFlow)
		: playwrightRecorder.stopRecording(recordingId);
}

export function handleCancelRecording(recordingId: string): void {
	const kind = recorderByRecording.get(recordingId);
	recorderByRecording.delete(recordingId);
	// Seul le chemin mobile a un serveur Studio à stopper ; web = no-op.
	if (kind === "mobile") maestroRecorder.cancelRecording(recordingId);
}
