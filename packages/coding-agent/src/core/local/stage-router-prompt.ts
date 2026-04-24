function isTruthy(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isLocalRuntimeEnabled(): boolean {
	return Boolean(
		isTruthy(process.env.NOVA_LOCAL_MODE) ||
			process.env.NOVA_LOCAL_PROFILE ||
			process.env.NOVA_LOCAL_REFERENCE ||
			process.env.NOVA_LOCAL_BACKEND,
	);
}

export function buildLocalStageRouterPrompt(): string {
	return [
		"Local deterministic routing is active.",
		"Use exactly two internal stages before each tool action:",
		"Stage 1 (slot selection): choose one visible slot: inspect | modify | execute | meta.",
		"Stage 2 (slot invocation): produce one invocation matching the chosen slot.",
		"Hard constraints:",
		"- At most one tool call per assistant turn.",
		"- inspect never runs commands.",
		"- modify never finishes directly.",
		"- execute never edits files directly.",
		"- meta is for summarize_state | update_task_state | escalate.",
		"When repeated tool validation failures occur, prefer meta.escalate with a concrete reason.",
	].join("\n");
}
