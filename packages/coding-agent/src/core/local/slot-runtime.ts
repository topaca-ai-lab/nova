import {
	type LocalTurnSignals,
	routeSlotInvocation,
	type SlotInvocation,
	type SlotRoutingErrorClass,
	type SlotSelection,
	type VisibleToolSlot,
	validateSlotSelection,
} from "@nova-ai/nova-agent-core";
import {
	inferSlotInvocationFromCodingAgentTool,
	inferSlotSelectionFromCodingAgentTool,
	isRoutableCodingAgentToolName,
} from "./tools/tool-slots.js";

export type LocalSlotRuntimeState = {
	signals: LocalTurnSignals;
	maxRepairAttempts: number;
};

export type LocalSlotRouteResult =
	| {
			ok: true;
			slot?: VisibleToolSlot;
			track: boolean;
			stage1?: SlotSelection;
			stage2?: SlotInvocation;
	  }
	| { ok: false; errorClass: SlotRoutingErrorClass; message: string };

type ErrorDetails = {
	errorClass?: SlotRoutingErrorClass;
};

function asErrorDetails(value: unknown): ErrorDetails {
	if (value && typeof value === "object") {
		const details = value as Record<string, unknown>;
		const errorClass = details.errorClass;
		if (
			errorClass === "invalid_slot" ||
			errorClass === "invalid_args" ||
			errorClass === "invalid_schema" ||
			errorClass === "unsupported_action" ||
			errorClass === "non_retryable"
		) {
			return { errorClass };
		}
	}
	return {};
}

export function createLocalSlotRuntimeState(maxRepairAttempts: number): LocalSlotRuntimeState {
	return {
		signals: {
			hasNewInformationSinceLastMeta: true,
			executeTurnsWithoutStateUpdate: 0,
			repairFailures: 0,
			taskStateAgeInTurns: 0,
			workingMemoryConfidence: 1,
		},
		maxRepairAttempts,
	};
}

export function routeLocalToolCall(
	toolName: string,
	args: unknown,
	state: LocalSlotRuntimeState,
): LocalSlotRouteResult {
	if (!isRoutableCodingAgentToolName(toolName)) {
		return {
			ok: true,
			track: false,
		};
	}
	const selection = inferSlotSelectionFromCodingAgentTool(toolName, args);
	if (!selection) {
		return {
			ok: false,
			errorClass: "unsupported_action",
			message: `Tool "${toolName}" is not mapped to a local runtime slot selection.`,
		};
	}
	const stage1 = validateSlotSelection(selection, state.signals, {
		maxRepairAttempts: state.maxRepairAttempts,
	});
	if (!stage1.ok) {
		return {
			ok: false,
			errorClass: stage1.errorClass,
			message: stage1.message,
		};
	}
	const invocation = inferSlotInvocationFromCodingAgentTool(toolName, selection, args);
	if (!invocation) {
		return {
			ok: false,
			errorClass: "invalid_args",
			message: `Tool "${toolName}" arguments could not be transformed into a valid slot invocation.`,
		};
	}
	const routed = routeSlotInvocation({
		selection,
		invocation,
		state: state.signals,
		options: { maxRepairAttempts: state.maxRepairAttempts },
	});
	if (!routed.ok) {
		return {
			ok: false,
			errorClass: routed.errorClass,
			message: routed.message,
		};
	}
	return {
		ok: true,
		slot: routed.slot,
		track: true,
		stage1: selection,
		stage2: invocation,
	};
}

export function updateLocalSlotRuntimeStateAfterTool(
	state: LocalSlotRuntimeState,
	slot: VisibleToolSlot,
	isError: boolean,
	details: unknown,
): void {
	const errorClass = asErrorDetails(details).errorClass;
	state.signals.previousSlot = slot;
	state.signals.lastErrorClass = errorClass;

	if (slot === "meta") {
		state.signals.executeTurnsWithoutStateUpdate = 0;
		state.signals.taskStateAgeInTurns = 0;
		state.signals.hasNewInformationSinceLastMeta = false;
	} else {
		state.signals.taskStateAgeInTurns = (state.signals.taskStateAgeInTurns ?? 0) + 1;
		state.signals.hasNewInformationSinceLastMeta = true;
		if (slot === "execute" && !isError) {
			state.signals.executeTurnsWithoutStateUpdate = (state.signals.executeTurnsWithoutStateUpdate ?? 0) + 1;
		}
		if (slot === "modify" && !isError) {
			state.signals.executeTurnsWithoutStateUpdate = 0;
		}
	}

	if (errorClass === "invalid_slot" || errorClass === "invalid_args" || errorClass === "invalid_schema") {
		state.signals.repairFailures = (state.signals.repairFailures ?? 0) + 1;
	} else if (!isError) {
		state.signals.repairFailures = 0;
	}

	state.signals.turnEndedWithoutValidTool = isError && !errorClass;
}
