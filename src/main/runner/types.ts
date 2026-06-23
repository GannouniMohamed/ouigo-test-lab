import type {
	Environment,
	RunEvent,
	RunResult,
	Scenario,
} from "../../shared/types";

export interface TestRunner {
	run(
		scenario: Scenario,
		env: Environment,
		onEvent: (e: RunEvent) => void,
	): Promise<RunResult>;
	cancel(runId: string): Promise<void>;
}
