export type VisibleToolSlot = "inspect" | "modify" | "execute" | "meta";

export type SlotSelection = {
	slot: VisibleToolSlot;
	rationale?: string;
};

export type InspectInvocation = {
	slot: "inspect";
	action: "read" | "list_files" | "search";
	target?: string;
	query?: string;
};

export type ModifyInvocation = {
	slot: "modify";
	action: "write_file" | "append_file" | "replace_range";
	path: string;
	content?: string;
	startLine?: number;
	endLine?: number;
};

export type ExecuteInvocation =
	| {
			slot: "execute";
			action: "run_command";
			command: string;
	  }
	| {
			slot: "execute";
			action: "finish";
			summary?: string;
	  };

export type MetaInvocation =
	| {
			slot: "meta";
			action: "summarize_state";
			summary: string;
	  }
	| {
			slot: "meta";
			action: "update_task_state";
			summary: string;
			nextStep: string;
	  }
	| {
			slot: "meta";
			action: "escalate";
			reason: string;
			proposedFallback?: string;
	  };

export type SlotInvocation = InspectInvocation | ModifyInvocation | ExecuteInvocation | MetaInvocation;

export type SlotRoutingErrorClass =
	| "invalid_slot"
	| "invalid_args"
	| "invalid_schema"
	| "unsupported_action"
	| "non_retryable";

export type LocalTurnSignals = {
	previousSlot?: VisibleToolSlot;
	hasNewInformationSinceLastMeta?: boolean;
	executeTurnsWithoutStateUpdate?: number;
	repairFailures?: number;
	taskStateAgeInTurns?: number;
	workingMemoryConfidence?: number;
	hardCompactionTriggered?: boolean;
	stagnationDetected?: boolean;
	turnEndedWithoutValidTool?: boolean;
	executeOutputAmbiguous?: boolean;
	lastErrorClass?: SlotRoutingErrorClass;
};

export type InternalToolName =
	| "read"
	| "list_files"
	| "search"
	| "write_file"
	| "append_file"
	| "replace_range"
	| "run_command"
	| "finish"
	| "meta.summarize_state"
	| "meta.update_task_state"
	| "meta.escalate";

export type SlotRoutingSuccess = {
	ok: true;
	slot: VisibleToolSlot;
	invocation: SlotInvocation;
	internalTool: InternalToolName;
};

export type SlotRoutingFailure = {
	ok: false;
	errorClass: SlotRoutingErrorClass;
	message: string;
	allowedSlots?: VisibleToolSlot[];
};

export type SlotRoutingResult = SlotRoutingSuccess | SlotRoutingFailure;
