import {
	LOCAL_DEFAULT_CONTEXT_POLICY,
	LOCAL_DEFAULT_REPAIR_POLICY,
	LOCAL_DEFAULT_TIMEOUT_POLICY,
	type LocalRuntimeProfile,
} from "../runtime-profile.js";
import { LOCAL_DIALOG_SAMPLING_PROFILE } from "../sampling-profile.js";

export const OLLAMA_OPENAI_PROFILE: LocalRuntimeProfile = {
	id: "ollama_openai_compat",
	backendType: "openai_compat",
	supportsStreaming: true,
	supportsTools: true,
	supportsJsonSchema: true,
	supportsSystemRole: true,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	toolCallMode: "openai_compat",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	maxTokensField: "max_tokens",
	sampling: LOCAL_DIALOG_SAMPLING_PROFILE,
	contextPolicy: LOCAL_DEFAULT_CONTEXT_POLICY,
	repairPolicy: LOCAL_DEFAULT_REPAIR_POLICY,
	timeoutPolicy: LOCAL_DEFAULT_TIMEOUT_POLICY,
	compatNotes: ["Use for Ollama OpenAI-compatible endpoints, including LiteLLM proxy mode."],
};
