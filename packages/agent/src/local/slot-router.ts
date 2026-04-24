import type { MetaPolicyOptions } from "./meta-policy.js";
import { getSlotPolicyDecision } from "./slot-policy.js";
import type {
	InternalToolName,
	LocalTurnSignals,
	SlotInvocation,
	SlotRoutingFailure,
	SlotRoutingResult,
	SlotSelection,
	VisibleToolSlot,
} from "./types.js";

export type SlotSelectionValidation =
	| {
			ok: true;
			selection: SlotSelection;
			allowedSlots: VisibleToolSlot[];
			preferredSlot?: VisibleToolSlot;
	  }
	| {
			ok: false;
			errorClass: "invalid_slot";
			message: string;
			allowedSlots: VisibleToolSlot[];
	  };

function invalidSlot(message: string, allowedSlots: VisibleToolSlot[]): SlotRoutingFailure {
	return {
		ok: false,
		errorClass: "invalid_slot",
		message,
		allowedSlots,
	};
}

function invalidArgs(message: string): SlotRoutingFailure {
	return {
		ok: false,
		errorClass: "invalid_args",
		message,
	};
}

function mapToInternalTool(invocation: SlotInvocation): InternalToolName {
	switch (invocation.slot) {
		case "inspect":
			return invocation.action;
		case "modify":
			return invocation.action;
		case "execute":
			return invocation.action;
		case "meta":
			switch (invocation.action) {
				case "summarize_state":
					return "meta.summarize_state";
				case "update_task_state":
					return "meta.update_task_state";
				case "escalate":
					return "meta.escalate";
			}
	}
}

function validateInvocationShape(invocation: SlotInvocation): SlotRoutingFailure | undefined {
	if (invocation.slot === "inspect" && invocation.action === "search" && !invocation.query) {
		return invalidArgs("inspect.search requires query.");
	}
	if (invocation.slot === "modify") {
		if (!invocation.path || invocation.path.trim().length === 0) {
			return invalidArgs("modify actions require a non-empty path.");
		}
		if (invocation.action === "replace_range") {
			if (invocation.startLine === undefined || invocation.endLine === undefined) {
				return invalidArgs("modify.replace_range requires startLine and endLine.");
			}
		}
	}
	if (invocation.slot === "execute" && invocation.action === "run_command") {
		if (!invocation.command || invocation.command.trim().length === 0) {
			return invalidArgs("execute.run_command requires command.");
		}
	}
	if (invocation.slot === "meta") {
		if (invocation.action === "summarize_state" && invocation.summary.trim().length === 0) {
			return invalidArgs("meta.summarize_state requires summary.");
		}
		if (invocation.action === "update_task_state") {
			if (invocation.summary.trim().length === 0 || invocation.nextStep.trim().length === 0) {
				return invalidArgs("meta.update_task_state requires summary and nextStep.");
			}
		}
		if (invocation.action === "escalate" && invocation.reason.trim().length === 0) {
			return invalidArgs("meta.escalate requires reason.");
		}
	}
	return undefined;
}

export function validateSlotSelection(
	selection: SlotSelection,
	state: LocalTurnSignals,
	options: MetaPolicyOptions = {},
): SlotSelectionValidation {
	const policy = getSlotPolicyDecision(state, options);
	if (!policy.allowedSlots.includes(selection.slot)) {
		return {
			ok: false,
			errorClass: "invalid_slot",
			message: `Slot "${selection.slot}" is not allowed in current state.`,
			allowedSlots: policy.allowedSlots,
		};
	}
	return {
		ok: true,
		selection,
		allowedSlots: policy.allowedSlots,
		preferredSlot: policy.preferredSlot,
	};
}

export function routeSlotInvocation(input: {
	selection: SlotSelection;
	invocation: SlotInvocation;
	state: LocalTurnSignals;
	options?: MetaPolicyOptions;
}): SlotRoutingResult {
	const policy = getSlotPolicyDecision(input.state, input.options);
	if (!policy.allowedSlots.includes(input.selection.slot)) {
		return invalidSlot(
			`Selected slot "${input.selection.slot}" is not allowed in current state.`,
			policy.allowedSlots,
		);
	}
	if (policy.forcedSlot && input.selection.slot !== policy.forcedSlot) {
		return invalidSlot(
			`Slot "${input.selection.slot}" is not allowed; forced slot is "${policy.forcedSlot}".`,
			policy.allowedSlots,
		);
	}
	if (input.selection.slot !== input.invocation.slot) {
		return invalidArgs(
			`Slot invocation mismatch: selected "${input.selection.slot}" but invocation uses "${input.invocation.slot}".`,
		);
	}

	const validationError = validateInvocationShape(input.invocation);
	if (validationError) {
		return validationError;
	}

	return {
		ok: true,
		slot: input.selection.slot,
		invocation: input.invocation,
		internalTool: mapToInternalTool(input.invocation),
	};
}
