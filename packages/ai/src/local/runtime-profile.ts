import type { SamplingProfile } from "./sampling-profile.js";

export type ContextPolicy = {
	taskStateBudget: number;
	workingMemoryBudget: number;
	fileMemoryBudget: number;
	sessionSummaryBudget: number;
	toolPolicyBudget: number;
	softCompactionThreshold: number;
	hardCompactionThreshold: number;
	maintenanceEveryNTurns: number;
};

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

export type TimeoutPolicy = {
	requestTimeoutMs: number;
	toolTimeoutMs: number;
	idleTimeoutMs?: number;
};

export type LocalRuntimeProfile = {
	id: string;
	backendType: "ollama" | "vllm" | "sglang" | "openai_compat" | "other";
	supportsStreaming: boolean;
	supportsTools: boolean;
	supportsJsonSchema: boolean;
	supportsSystemRole: boolean;
	supportsDeveloperRole: boolean;
	supportsReasoningEffort: boolean;
	toolCallMode: "native" | "openai_compat" | "json_fallback" | "disabled";
	toolParser?: string;
	reasoningParser?: string;
	requiresToolResultName?: boolean;
	requiresAssistantAfterToolResult?: boolean;
	maxTokensField?: "max_tokens" | "max_completion_tokens";
	sampling: SamplingProfile;
	contextPolicy: ContextPolicy;
	repairPolicy: RepairPolicy;
	timeoutPolicy: TimeoutPolicy;
	compatNotes?: string[];
};

export const LOCAL_DEFAULT_CONTEXT_POLICY: ContextPolicy = {
	taskStateBudget: 220,
	workingMemoryBudget: 800,
	fileMemoryBudget: 1400,
	sessionSummaryBudget: 450,
	toolPolicyBudget: 120,
	softCompactionThreshold: 0.7,
	hardCompactionThreshold: 0.85,
	maintenanceEveryNTurns: 6,
};

export const LOCAL_DEFAULT_REPAIR_POLICY: RepairPolicy = {
	maxRepairAttempts: 2,
	allowAlternativeToolSlot: true,
	fallbackToFinish: true,
	templates: {
		invalidArgs: "repair-invalid-args.md",
		invalidSchema: "repair-invalid-schema.md",
		invalidSlot: "repair-invalid-slot.md",
	},
};

export const LOCAL_DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = {
	requestTimeoutMs: 120_000,
	toolTimeoutMs: 120_000,
	idleTimeoutMs: 30_000,
};

export function cloneRuntimeProfile(profile: LocalRuntimeProfile): LocalRuntimeProfile {
	return {
		...profile,
		sampling: { ...profile.sampling, toolCallOverrides: profile.sampling.toolCallOverrides },
		contextPolicy: { ...profile.contextPolicy },
		repairPolicy: { ...profile.repairPolicy, templates: { ...profile.repairPolicy.templates } },
		timeoutPolicy: { ...profile.timeoutPolicy },
		compatNotes: profile.compatNotes ? [...profile.compatNotes] : undefined,
	};
}
