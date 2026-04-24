import { getLocalRuntimeProfile, type OpenAICompletionsCompat, resolveReferenceRuntimeProfile } from "@nova-ai/nova-ai";
import type { ModelRegistry } from "./model-registry.js";

type LocalRuntimeProfileDiagnostic = {
	type: "info" | "warning" | "error";
	message: string;
};

function isTruthy(value: string | undefined): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function resolveProfileId(): string | undefined {
	const explicit = process.env.NOVA_LOCAL_PROFILE?.trim();
	if (explicit) return explicit;

	const reference = process.env.NOVA_LOCAL_REFERENCE?.trim();
	if (reference === "qwen3_vllm" || reference === "qwen3_sglang" || reference === "qwen3_ollama_litellm") {
		return resolveReferenceRuntimeProfile(reference).id;
	}

	if (isTruthy(process.env.NOVA_LOCAL_MODE)) {
		return resolveReferenceRuntimeProfile("qwen3_ollama_litellm").id;
	}

	return undefined;
}

function mapProfileToCompat(profile: ReturnType<typeof getLocalRuntimeProfile>): OpenAICompletionsCompat | undefined {
	if (!profile) return undefined;

	return {
		supportsDeveloperRole: profile.supportsDeveloperRole,
		supportsReasoningEffort: profile.supportsReasoningEffort,
		requiresToolResultName: profile.requiresToolResultName,
		requiresAssistantAfterToolResult: profile.requiresAssistantAfterToolResult,
		maxTokensField: profile.maxTokensField,
		supportsStrictMode: profile.supportsJsonSchema,
	};
}

export function applyConfiguredLocalRuntimeProfile(modelRegistry: ModelRegistry): LocalRuntimeProfileDiagnostic[] {
	const diagnostics: LocalRuntimeProfileDiagnostic[] = [];
	const profileId = resolveProfileId();
	if (!profileId) {
		return diagnostics;
	}

	const profile = getLocalRuntimeProfile(profileId);
	if (!profile) {
		diagnostics.push({
			type: "error",
			message: `Unknown NOVA_LOCAL_PROFILE "${profileId}".`,
		});
		return diagnostics;
	}

	const provider = process.env.NOVA_LOCAL_PROVIDER?.trim() || "openai";
	const baseUrl = process.env.NOVA_LOCAL_BASE_URL || process.env.LITELLM_BASE_URL || process.env.OPENAI_BASE_URL;
	const apiKey = process.env.NOVA_LOCAL_API_KEY || process.env.OPENAI_API_KEY;
	const compat = mapProfileToCompat(profile);

	try {
		modelRegistry.registerProvider(provider, {
			baseUrl,
			apiKey,
			compat,
		});
		diagnostics.push({
			type: "info",
			message: `Applied local runtime profile "${profile.id}" to provider "${provider}".`,
		});
	} catch (error) {
		diagnostics.push({
			type: "error",
			message: `Failed to apply local runtime profile "${profile.id}": ${error instanceof Error ? error.message : String(error)}`,
		});
	}

	return diagnostics;
}
