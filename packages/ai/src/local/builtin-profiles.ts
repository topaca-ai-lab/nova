import { GEMMA4_VLLM_PROFILE } from "./profiles/gemma4-vllm.js";
import { OLLAMA_NATIVE_TOOLS_PROFILE } from "./profiles/ollama-native.js";
import { OLLAMA_OPENAI_PROFILE } from "./profiles/ollama-openai.js";
import { SGLANG_QWEN3_PROFILE } from "./profiles/sglang-qwen3.js";
import { VLLM_QWEN3_PROFILE } from "./profiles/vllm-qwen3.js";
import { cloneRuntimeProfile, type LocalRuntimeProfile } from "./runtime-profile.js";

export const BUILTIN_LOCAL_RUNTIME_PROFILES: Record<string, LocalRuntimeProfile> = {
	[VLLM_QWEN3_PROFILE.id]: VLLM_QWEN3_PROFILE,
	[SGLANG_QWEN3_PROFILE.id]: SGLANG_QWEN3_PROFILE,
	[OLLAMA_NATIVE_TOOLS_PROFILE.id]: OLLAMA_NATIVE_TOOLS_PROFILE,
	[OLLAMA_OPENAI_PROFILE.id]: OLLAMA_OPENAI_PROFILE,
	[GEMMA4_VLLM_PROFILE.id]: GEMMA4_VLLM_PROFILE,
};

export function listLocalRuntimeProfiles(): LocalRuntimeProfile[] {
	return Object.values(BUILTIN_LOCAL_RUNTIME_PROFILES).map(cloneRuntimeProfile);
}

export function getLocalRuntimeProfile(profileId: string): LocalRuntimeProfile | undefined {
	const profile = BUILTIN_LOCAL_RUNTIME_PROFILES[profileId];
	return profile ? cloneRuntimeProfile(profile) : undefined;
}

export function resolveReferenceRuntimeProfile(
	reference: "qwen3_vllm" | "qwen3_sglang" | "qwen3_ollama_litellm",
): LocalRuntimeProfile {
	switch (reference) {
		case "qwen3_vllm":
			return cloneRuntimeProfile(VLLM_QWEN3_PROFILE);
		case "qwen3_sglang":
			return cloneRuntimeProfile(SGLANG_QWEN3_PROFILE);
		case "qwen3_ollama_litellm":
			return cloneRuntimeProfile(OLLAMA_OPENAI_PROFILE);
	}
}
