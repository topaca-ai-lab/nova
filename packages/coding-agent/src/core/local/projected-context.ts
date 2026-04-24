import type { AgentMessage } from "@nova-ai/nova-agent-core";
import type { ContextPolicy } from "@nova-ai/nova-ai";
import type { FileMemorySegment } from "./file-memory.js";
import type { TaskStateSnapshot } from "./task-state-store.js";
import type { WorkingMemorySnapshot } from "./working-memory.js";

type ProjectionInputs = {
	policy: ContextPolicy;
	taskState: TaskStateSnapshot;
	workingMemory: WorkingMemorySnapshot;
	fileSegments: FileMemorySegment[];
	turnIndex: number;
};

function estimateMessageSize(message: AgentMessage): number {
	if (message.role === "user") {
		return typeof message.content === "string" ? message.content.length : JSON.stringify(message.content).length;
	}
	if (message.role === "assistant" || message.role === "toolResult") {
		return JSON.stringify(message).length;
	}
	return 120;
}

function selectTailMessages(messages: AgentMessage[], budget: number): AgentMessage[] {
	if (budget <= 0) {
		return [];
	}
	const selected: AgentMessage[] = [];
	let used = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const size = estimateMessageSize(messages[i]);
		if (selected.length > 0 && used + size > budget) {
			break;
		}
		selected.unshift(messages[i]);
		used += size;
	}
	return selected;
}

function buildProjectionText(inputs: ProjectionInputs): string {
	const lines: string[] = [];
	lines.push("Local projected context:");
	lines.push(`- turn: ${inputs.turnIndex}`);
	lines.push(`- task.ageInTurns: ${inputs.taskState.ageInTurns}`);
	if (inputs.taskState.summary) {
		lines.push(`- task.summary: ${inputs.taskState.summary}`);
	}
	if (inputs.taskState.nextStep) {
		lines.push(`- task.nextStep: ${inputs.taskState.nextStep}`);
	}
	lines.push(`- workingMemory.confidence: ${inputs.workingMemory.confidence.toFixed(2)}`);
	for (const item of inputs.workingMemory.items.slice(0, 3)) {
		lines.push(`- wm: ${item.text}`);
	}
	for (const segment of inputs.fileSegments.slice(0, 3)) {
		lines.push(`- file(${segment.path}): ${segment.snippet}`);
	}
	return lines.join("\n");
}

export function buildProjectedContext(messages: AgentMessage[], inputs: ProjectionInputs): AgentMessage[] {
	const sessionBudget = Math.max(
		200,
		inputs.policy.sessionSummaryBudget + inputs.policy.taskStateBudget + inputs.policy.workingMemoryBudget,
	);
	const projectedTail = selectTailMessages(messages, sessionBudget);
	const projectionBlock: AgentMessage = {
		role: "custom",
		customType: "local_projection",
		content: buildProjectionText(inputs),
		display: false,
		details: {
			kind: "local_projection",
			turn: inputs.turnIndex,
		},
		timestamp: Date.now(),
	};
	return [projectionBlock, ...projectedTail];
}
