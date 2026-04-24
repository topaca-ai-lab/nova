import type { LocalTurnSignals } from "./types.js";

export type MetaPolicyOptions = {
	maxRepairAttempts?: number;
	workingMemoryConfidenceThreshold?: number;
};

export type MetaPolicyEvaluation = {
	mustTrigger: boolean;
	shouldTrigger: boolean;
	isBlocked: boolean;
	mustReasons: string[];
	shouldReasons: string[];
	blockReasons: string[];
};

const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;

export function evaluateMetaPolicy(state: LocalTurnSignals, options: MetaPolicyOptions = {}): MetaPolicyEvaluation {
	const maxRepairAttempts = options.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
	const confidenceThreshold = options.workingMemoryConfidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

	const mustReasons: string[] = [];
	const shouldReasons: string[] = [];
	const blockReasons: string[] = [];

	if ((state.repairFailures ?? 0) >= maxRepairAttempts) {
		mustReasons.push("max_repair_attempts_reached");
	}
	if (state.hardCompactionTriggered) {
		mustReasons.push("hard_compaction_threshold_exceeded");
	}
	if (state.stagnationDetected) {
		mustReasons.push("stagnation_detected");
	}
	if (state.lastErrorClass === "non_retryable") {
		mustReasons.push("non_retryable_error");
	}

	if ((state.executeTurnsWithoutStateUpdate ?? 0) >= 3) {
		shouldReasons.push("execute_without_state_update");
	}
	if ((state.repairFailures ?? 0) >= 2) {
		shouldReasons.push("repair_failures_accumulated");
	}
	if ((state.taskStateAgeInTurns ?? 0) >= 5) {
		shouldReasons.push("task_state_stale");
	}
	if (state.workingMemoryConfidence !== undefined && state.workingMemoryConfidence < confidenceThreshold) {
		shouldReasons.push("low_working_memory_confidence");
	}
	if (state.executeOutputAmbiguous) {
		shouldReasons.push("ambiguous_execute_output");
	}
	if (state.turnEndedWithoutValidTool) {
		shouldReasons.push("turn_without_valid_tool");
	}

	if (state.previousSlot === "meta" && !state.hasNewInformationSinceLastMeta && mustReasons.length === 0) {
		blockReasons.push("meta_locked_until_new_information");
	}

	return {
		mustTrigger: mustReasons.length > 0,
		shouldTrigger: shouldReasons.length > 0,
		isBlocked: blockReasons.length > 0,
		mustReasons,
		shouldReasons,
		blockReasons,
	};
}
