import type { ContextPolicy } from "@nova-ai/nova-ai";

export type LocalCompactionTriggerReason =
	| "none"
	| "hard_threshold"
	| "soft_threshold"
	| "maintenance"
	| "repair_failures";

export type LocalCompactionTrigger = {
	shouldCompact: boolean;
	reason: LocalCompactionTriggerReason;
	usageRatio: number;
};

export type LocalCompactionTriggerInput = {
	contextTokens: number;
	contextWindow: number;
	turnIndex: number;
	lastCompactionTurn: number;
	repairFailures: number;
	policy: ContextPolicy;
};

export function evaluateLocalCompactionTrigger(input: LocalCompactionTriggerInput): LocalCompactionTrigger {
	if (input.contextWindow <= 0) {
		return { shouldCompact: false, reason: "none", usageRatio: 0 };
	}
	const usageRatio = input.contextTokens / input.contextWindow;

	if (usageRatio >= input.policy.hardCompactionThreshold) {
		return { shouldCompact: true, reason: "hard_threshold", usageRatio };
	}
	if (input.repairFailures >= 2) {
		return { shouldCompact: true, reason: "repair_failures", usageRatio };
	}
	if (usageRatio >= input.policy.softCompactionThreshold) {
		return { shouldCompact: true, reason: "soft_threshold", usageRatio };
	}
	if (input.turnIndex - input.lastCompactionTurn >= input.policy.maintenanceEveryNTurns) {
		return { shouldCompact: true, reason: "maintenance", usageRatio };
	}
	return { shouldCompact: false, reason: "none", usageRatio };
}
