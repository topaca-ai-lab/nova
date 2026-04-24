import type { BenchmarkReport, BenchmarkSlot, BenchmarkTaskResult } from "./benchmark-types.js";
import { summarizeTelemetry } from "./telemetry.js";

const BENCHMARK_SLOTS: BenchmarkSlot[] = ["inspect", "modify", "execute", "meta"];

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function buildBenchmarkReport(
	input: {
		backendHint: string;
		model: string;
		results: BenchmarkTaskResult[];
		notes?: string[];
	},
	generatedAt: Date = new Date(),
): BenchmarkReport {
	const totalTasks = input.results.length;
	const passedTasks = input.results.filter((result) => result.ok).length;
	const passRate = totalTasks > 0 ? passedTasks / totalTasks : 0;

	const averageLatencyMs =
		totalTasks > 0 ? input.results.reduce((sum, result) => sum + result.latencyMs, 0) / totalTasks : 0;
	const averageRepairCount =
		totalTasks > 0 ? input.results.reduce((sum, result) => sum + result.repairCount, 0) / totalTasks : 0;
	const actionValidityRate =
		totalTasks > 0 ? input.results.filter((result) => result.actionValid).length / totalTasks : 0;
	const executionCandidates = input.results.filter((result) => result.executionValidated !== undefined);
	const executionValidationRate =
		executionCandidates.length > 0
			? executionCandidates.filter((result) => result.executionValidated).length / executionCandidates.length
			: 1;

	const slotValidityRate = Object.fromEntries(
		BENCHMARK_SLOTS.map((slot) => {
			const slotResults = input.results.filter((result) => result.slot === slot);
			if (slotResults.length === 0) return [slot, 0];
			const valid = slotResults.filter((result) => result.slotValid).length;
			return [slot, round(valid / slotResults.length)];
		}),
	) as Record<BenchmarkSlot, number>;
	const toolExecutions = input.results.flatMap((result) => result.toolExecutions);
	const turns = input.results.flatMap((result) => result.turns);
	const telemetrySummary = summarizeTelemetry(toolExecutions, turns);

	return {
		version: "v1",
		generatedAt: generatedAt.toISOString(),
		backendHint: input.backendHint,
		model: input.model,
		totalTasks,
		passedTasks,
		passRate: round(passRate),
		averageLatencyMs: round(averageLatencyMs),
		averageRepairCount: round(averageRepairCount),
		slotValidityRate,
		actionValidityRate: round(actionValidityRate),
		executionValidationRate: round(executionValidationRate),
		telemetry: {
			toolExecutions,
			turns,
			summary: telemetrySummary,
		},
		results: input.results,
		notes: input.notes ?? [],
	};
}
