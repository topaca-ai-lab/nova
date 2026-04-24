export type SamplingProfile = {
	temperature: number;
	topP?: number;
	topK?: number;
	minP?: number;
	seed?: number;
	repetitionPenalty?: number;
	maxOutputTokens?: number;
	enforceForToolCalls: boolean;
	toolCallOverrides?: {
		temperature?: number;
		topP?: number;
		topK?: number;
		minP?: number;
		seed?: number;
	};
	benchmarkMode?: boolean;
};

export const LOCAL_DIALOG_SAMPLING_PROFILE: SamplingProfile = {
	temperature: 0.3,
	enforceForToolCalls: true,
	toolCallOverrides: {
		temperature: 0,
		topP: 1,
		seed: 42,
	},
};

export const LOCAL_DETERMINISTIC_TOOL_SAMPLING: Required<NonNullable<SamplingProfile["toolCallOverrides"]>> = {
	temperature: 0,
	topP: 1,
	topK: 0,
	minP: 0,
	seed: 42,
};

export function getToolCallSampling(profile: SamplingProfile): SamplingProfile {
	if (!profile.enforceForToolCalls) {
		return profile;
	}
	const overrides = profile.toolCallOverrides ?? LOCAL_DETERMINISTIC_TOOL_SAMPLING;
	return {
		...profile,
		temperature: overrides.temperature ?? 0,
		topP: overrides.topP ?? 1,
		topK: overrides.topK,
		minP: overrides.minP,
		seed: overrides.seed ?? 42,
	};
}
