import type { TelemetrySummary, ToolExecutionRecord, TurnTelemetryRecord } from "./telemetry.js";

export type BenchmarkSlot = "inspect" | "modify" | "execute" | "meta";

export type BenchmarkExecutionPlan =
	| { type: "read"; target: string; expectContains?: string }
	| { type: "list_files"; target: string; expectContains?: string }
	| { type: "search"; target: string; query: string }
	| { type: "run_command"; command: string[]; expectContains?: string };

export type BenchmarkTask = {
	id: string;
	title: string;
	prompt: string;
	expected: {
		slot: BenchmarkSlot;
		action?: string;
		maxRepairs?: number;
	};
	execution?: BenchmarkExecutionPlan;
};

export type BenchmarkTaskResult = {
	taskId: string;
	ok: boolean;
	slot: BenchmarkSlot;
	action?: string;
	slotValid: boolean;
	actionValid: boolean;
	repairCount: number;
	latencyMs: number;
	errorClass?: string;
	metaReason?: string;
	executionValidated?: boolean;
	executionEvidence?: string;
	toolExecutions: ToolExecutionRecord[];
	turns: TurnTelemetryRecord[];
};

export type BenchmarkReport = {
	version: "v1";
	generatedAt: string;
	backendHint: string;
	model: string;
	totalTasks: number;
	passedTasks: number;
	passRate: number;
	averageLatencyMs: number;
	averageRepairCount: number;
	slotValidityRate: Record<BenchmarkSlot, number>;
	actionValidityRate: number;
	executionValidationRate: number;
	telemetry: {
		toolExecutions: ToolExecutionRecord[];
		turns: TurnTelemetryRecord[];
		summary: TelemetrySummary;
	};
	results: BenchmarkTaskResult[];
	notes: string[];
};
