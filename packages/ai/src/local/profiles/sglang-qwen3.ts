import {
	LOCAL_DEFAULT_CONTEXT_POLICY,
	LOCAL_DEFAULT_REPAIR_POLICY,
	LOCAL_DEFAULT_TIMEOUT_POLICY,
	type LocalRuntimeProfile,
} from "../runtime-profile.js";
import { LOCAL_DIALOG_SAMPLING_PROFILE } from "../sampling-profile.js";

export const SGLANG_QWEN3_PROFILE: LocalRuntimeProfile = {
	id: "sglang_qwen3",
	backendType: "sglang",
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
	compatNotes: ["Set SGLang tool parser explicitly for Qwen family (qwen/qwen25/qwen3_coder depending on model)."],
};
