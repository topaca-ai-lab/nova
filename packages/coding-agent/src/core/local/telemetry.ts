import type { BenchmarkSlot } from "./benchmark-types.js";

export type ToolExecutionRecord = {
	taskId: string;
	turnIndex: number;
	slot: BenchmarkSlot;
	action?: string;
	latencyMs: number;
	repairAttempt: number;
	success: boolean;
	errorClass?: string;
};

export type TurnTelemetryRecord = {
	taskId: string;
	turnIndex: number;
	contextRatioBefore: number;
	contextRatioAfter: number;
	adapter: "host" | "sandbox" | "none";
	metaReason?: string;
	errorClass?: string;
};

export type TelemetrySummary = {
	toolCalls: number;
	toolSuccessRate: number;
	repairFailures: number;
	averageContextRatioBefore: number;
	averageContextRatioAfter: number;
};

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function summarizeTelemetry(
	toolExecutions: ToolExecutionRecord[],
	turns: TurnTelemetryRecord[],
): TelemetrySummary {
	const toolCalls = toolExecutions.length;
	const successfulToolCalls = toolExecutions.filter((record) => record.success).length;
	const repairFailures = toolExecutions.filter((record) => !record.success && record.repairAttempt > 0).length;
	const toolSuccessRate = toolCalls > 0 ? successfulToolCalls / toolCalls : 0;

	const averageContextRatioBefore =
		turns.length > 0 ? turns.reduce((sum, turn) => sum + turn.contextRatioBefore, 0) / turns.length : 0;
	const averageContextRatioAfter =
		turns.length > 0 ? turns.reduce((sum, turn) => sum + turn.contextRatioAfter, 0) / turns.length : 0;

	return {
		toolCalls,
		toolSuccessRate: round(toolSuccessRate),
		repairFailures,
		averageContextRatioBefore: round(averageContextRatioBefore),
		averageContextRatioAfter: round(averageContextRatioAfter),
	};
}
