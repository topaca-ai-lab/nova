import type { BenchmarkReport } from "./benchmark-types.js";

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export type BenchmarkDiff = {
	olderLabel: string;
	newerLabel: string;
	metrics: {
		passRateDelta: number;
		actionValidityDelta: number;
		executionValidationDelta: number;
		averageLatencyDeltaMs: number;
		averageRepairCountDelta: number;
		toolSuccessRateDelta: number;
	};
	regressed: boolean;
	regressions: string[];
};

export function diffBenchmarkReports(
	older: BenchmarkReport,
	newer: BenchmarkReport,
	labels?: { olderLabel?: string; newerLabel?: string },
): BenchmarkDiff {
	const metrics = {
		passRateDelta: round(newer.passRate - older.passRate),
		actionValidityDelta: round(newer.actionValidityRate - older.actionValidityRate),
		executionValidationDelta: round(newer.executionValidationRate - older.executionValidationRate),
		averageLatencyDeltaMs: round(newer.averageLatencyMs - older.averageLatencyMs),
		averageRepairCountDelta: round(newer.averageRepairCount - older.averageRepairCount),
		toolSuccessRateDelta: round(newer.telemetry.summary.toolSuccessRate - older.telemetry.summary.toolSuccessRate),
	};
	const regressions: string[] = [];
	if (metrics.passRateDelta < 0) regressions.push("pass_rate");
	if (metrics.executionValidationDelta < 0) regressions.push("execution_validation");
	if (metrics.actionValidityDelta < 0) regressions.push("action_validity");
	if (metrics.toolSuccessRateDelta < 0) regressions.push("tool_success_rate");
	if (metrics.averageRepairCountDelta > 0) regressions.push("repair_count");
	if (metrics.averageLatencyDeltaMs > 0) regressions.push("latency_ms");

	return {
		olderLabel: labels?.olderLabel ?? older.generatedAt,
		newerLabel: labels?.newerLabel ?? newer.generatedAt,
		metrics,
		regressed: regressions.length > 0,
		regressions,
	};
}
