import type {
	Environment,
	RunEvent,
	RunOptions,
	RunResult,
	Scenario,
} from "../../shared/types";

export interface TestRunner {
	run(
		scenario: Scenario,
		env: Environment,
		onEvent: (e: RunEvent) => void,
		opts?: RunOptions,
	): Promise<RunResult>;
	cancel(runId: string): Promise<void>;
}
