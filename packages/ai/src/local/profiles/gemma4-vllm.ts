import {
	LOCAL_DEFAULT_CONTEXT_POLICY,
	LOCAL_DEFAULT_REPAIR_POLICY,
	LOCAL_DEFAULT_TIMEOUT_POLICY,
	type LocalRuntimeProfile,
} from "../runtime-profile.js";
import { LOCAL_DIALOG_SAMPLING_PROFILE } from "../sampling-profile.js";

export const GEMMA4_VLLM_PROFILE: LocalRuntimeProfile = {
	id: "gemma4_vllm",
	backendType: "vllm",
	supportsStreaming: true,
	supportsTools: true,
	supportsJsonSchema: true,
	supportsSystemRole: true,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	toolCallMode: "openai_compat",
	toolParser: "gemma",
	reasoningParser: "gemma",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	maxTokensField: "max_tokens",
	sampling: LOCAL_DIALOG_SAMPLING_PROFILE,
	contextPolicy: LOCAL_DEFAULT_CONTEXT_POLICY,
	repairPolicy: LOCAL_DEFAULT_REPAIR_POLICY,
	timeoutPolicy: LOCAL_DEFAULT_TIMEOUT_POLICY,
	compatNotes: [
		"Profile targets Gemma 4 on vLLM with function calling enabled; parser can differ by serving template.",
	],
};
