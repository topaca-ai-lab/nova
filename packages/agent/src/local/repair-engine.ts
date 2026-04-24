import type { SlotRoutingErrorClass, VisibleToolSlot } from "./types.js";

export type RepairPolicy = {
	maxRepairAttempts: number;
	allowAlternativeToolSlot: boolean;
	fallbackToFinish: boolean;
	templates: {
		invalidArgs: string;
		invalidSchema: string;
		invalidSlot: string;
	};
};

export type RepairPlanInput = {
	errorClass: SlotRoutingErrorClass;
	repairAttempts: number;
	validationError?: string;
	allowedSchema?: string;
	invalidInvocation?: string;
	invalidOutput?: string;
	allowedSlots?: VisibleToolSlot[];
	taskState?: string;
	alternativeSlot?: VisibleToolSlot;
	policy?: RepairPolicy;
};

export type RepairPlan = {
	nextRepairAttempts: number;
	action: "retry" | "alternative_slot" | "finish" | "meta_escalate";
	repairPrompt?: string;
	reason: string;
};

const TEMPLATE_INVALID_ARGS = `You selected a valid slot and action, but the arguments are invalid.

Return only a corrected invocation object.
Do not explain.
Do not change the slot unless explicitly instructed.

Validation error:
{{validation_error}}

Allowed schema:
{{allowed_schema}}

Last invalid invocation:
{{invalid_invocation}}`;

const TEMPLATE_INVALID_SCHEMA = `Your last output did not match the required schema.

Return exactly one valid JSON object matching this schema.
No prose.
No markdown.
No explanation.

Schema:
{{allowed_schema}}

Previous output:
{{invalid_output}}`;

const TEMPLATE_INVALID_SLOT = `Your selected slot is not allowed for the current task state.

Allowed slots now:
{{allowed_slots}}

Current task state:
{{task_state}}

Return only:
{ "slot": "<allowed_slot>" }`;

const DEFAULT_REPAIR_POLICY: RepairPolicy = {
	maxRepairAttempts: 2,
	allowAlternativeToolSlot: true,
	fallbackToFinish: true,
	templates: {
		invalidArgs: "repair-invalid-args.md",
		invalidSchema: "repair-invalid-schema.md",
		invalidSlot: "repair-invalid-slot.md",
	},
};

function resolvePolicy(policy: RepairPolicy | undefined): RepairPolicy {
	if (!policy) {
		return DEFAULT_REPAIR_POLICY;
	}
	return {
		...DEFAULT_REPAIR_POLICY,
		...policy,
		templates: {
			...DEFAULT_REPAIR_POLICY.templates,
			...policy.templates,
		},
	};
}

function renderTemplate(template: string, variables: Record<string, string>): string {
	let output = template;
	for (const [key, value] of Object.entries(variables)) {
		output = output.replaceAll(`{{${key}}}`, value);
	}
	return output;
}

function resolveTemplateForErrorClass(errorClass: SlotRoutingErrorClass, policy: RepairPolicy): string | undefined {
	if (errorClass === "invalid_args") {
		return policy.templates.invalidArgs.includes("{{") ? policy.templates.invalidArgs : TEMPLATE_INVALID_ARGS;
	}
	if (errorClass === "invalid_schema") {
		return policy.templates.invalidSchema.includes("{{") ? policy.templates.invalidSchema : TEMPLATE_INVALID_SCHEMA;
	}
	if (errorClass === "invalid_slot") {
		return policy.templates.invalidSlot.includes("{{") ? policy.templates.invalidSlot : TEMPLATE_INVALID_SLOT;
	}
	return undefined;
}

function buildRepairPrompt(input: RepairPlanInput, policy: RepairPolicy): string | undefined {
	const template = resolveTemplateForErrorClass(input.errorClass, policy);
	if (!template) {
		return undefined;
	}
	return renderTemplate(template, {
		validation_error: input.validationError ?? "unknown",
		allowed_schema: input.allowedSchema ?? "unknown",
		invalid_invocation: input.invalidInvocation ?? "unknown",
		invalid_output: input.invalidOutput ?? "unknown",
		allowed_slots: input.allowedSlots?.join(", ") ?? "unknown",
		task_state: input.taskState ?? "unknown",
	});
}

export function planRepair(input: RepairPlanInput): RepairPlan {
	const policy = resolvePolicy(input.policy);
	const nextRepairAttempts = input.repairAttempts + 1;

	if (nextRepairAttempts <= policy.maxRepairAttempts) {
		return {
			nextRepairAttempts,
			action: "retry",
			repairPrompt: buildRepairPrompt(input, policy),
			reason: `Repair attempt ${nextRepairAttempts}/${policy.maxRepairAttempts}.`,
		};
	}

	if (policy.allowAlternativeToolSlot && input.alternativeSlot) {
		return {
			nextRepairAttempts,
			action: "alternative_slot",
			reason: `Exceeded max repair attempts; switching to alternative slot "${input.alternativeSlot}".`,
		};
	}

	if (policy.fallbackToFinish) {
		return {
			nextRepairAttempts,
			action: "finish",
			reason: "Exceeded max repair attempts; fallback to finish.",
		};
	}

	return {
		nextRepairAttempts,
		action: "meta_escalate",
		reason: "Exceeded max repair attempts; escalate via meta policy.",
	};
}
