import {
	LOCAL_DEFAULT_CONTEXT_POLICY,
	LOCAL_DEFAULT_REPAIR_POLICY,
	LOCAL_DEFAULT_TIMEOUT_POLICY,
	type LocalRuntimeProfile,
} from "../runtime-profile.js";
import { LOCAL_DIALOG_SAMPLING_PROFILE } from "../sampling-profile.js";

export const VLLM_QWEN3_PROFILE: LocalRuntimeProfile = {
	id: "vllm_qwen3",
	backendType: "vllm",
	supportsStreaming: true,
	supportsTools: true,
	supportsJsonSchema: true,
	supportsSystemRole: true,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	toolCallMode: "openai_compat",
	toolParser: "qwen3_coder",
	reasoningParser: "qwen3",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	maxTokensField: "max_tokens",
	sampling: LOCAL_DIALOG_SAMPLING_PROFILE,
	contextPolicy: LOCAL_DEFAULT_CONTEXT_POLICY,
	repairPolicy: LOCAL_DEFAULT_REPAIR_POLICY,
	timeoutPolicy: LOCAL_DEFAULT_TIMEOUT_POLICY,
	compatNotes: ["Requires vLLM startup with --enable-auto-tool-choice and --tool-call-parser qwen3_coder."],
};
