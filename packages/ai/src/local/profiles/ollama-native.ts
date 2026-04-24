import {
	LOCAL_DEFAULT_CONTEXT_POLICY,
	LOCAL_DEFAULT_REPAIR_POLICY,
	LOCAL_DEFAULT_TIMEOUT_POLICY,
	type LocalRuntimeProfile,
} from "../runtime-profile.js";
import { LOCAL_DIALOG_SAMPLING_PROFILE } from "../sampling-profile.js";

export const OLLAMA_NATIVE_TOOLS_PROFILE: LocalRuntimeProfile = {
	id: "ollama_native_tools",
	backendType: "ollama",
	supportsStreaming: true,
	supportsTools: true,
	supportsJsonSchema: true,
	supportsSystemRole: true,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	toolCallMode: "native",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	maxTokensField: "max_tokens",
	sampling: LOCAL_DIALOG_SAMPLING_PROFILE,
	contextPolicy: LOCAL_DEFAULT_CONTEXT_POLICY,
	repairPolicy: LOCAL_DEFAULT_REPAIR_POLICY,
	timeoutPolicy: LOCAL_DEFAULT_TIMEOUT_POLICY,
	compatNotes: ["Use when calling Ollama native /api/chat endpoints with built-in tool calling."],
};
