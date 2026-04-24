import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { probeLocalCapabilities } from "@nova-ai/nova-ai";
import { executeBenchmarkAction } from "./benchmark-action-executor.js";
import { buildBenchmarkReport } from "./benchmark-report.js";
import type { BenchmarkReport, BenchmarkSlot, BenchmarkTask, BenchmarkTaskResult } from "./benchmark-types.js";
import type { ToolExecutionRecord, TurnTelemetryRecord } from "./telemetry.js";

type ProbedCapabilities = {
	connectivity: boolean;
	toolCalling: boolean;
	jsonSchema: boolean;
};

type LiveToolDefinition = {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, { type: "string" }>;
			required: string[];
		};
	};
};

type OpenAIToolCall = {
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
};

type ChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string;
			tool_calls?: OpenAIToolCall[];
		};
	}>;
	usage?: {
		total_tokens?: number;
	};
};

function resolveDefaultTaskPath(cwd: string): string {
	const packageRelative = join(cwd, "packages/coding-agent/bench/tasks/reference-v1.json");
	if (existsSync(packageRelative)) {
		return packageRelative;
	}
	return join(cwd, "bench/tasks/reference-v1.json");
}

function normalizeRootBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/v1")) {
		return trimmed.slice(0, -3);
	}
	return trimmed;
}

function normalizeApiBaseUrl(baseUrl: string): string {
	return `${normalizeRootBaseUrl(baseUrl)}/v1`;
}

function buildHeaders(apiKey?: string): Record<string, string> {
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
	}
	return headers;
}

function parseJson(text: string): ChatCompletionResponse | undefined {
	try {
		return JSON.parse(text) as ChatCompletionResponse;
	} catch {
		return undefined;
	}
}

function assertBenchmarkTask(value: unknown): BenchmarkTask {
	if (!value || typeof value !== "object") {
		throw new Error("Benchmark task must be an object.");
	}
	const task = value as Partial<BenchmarkTask>;
	if (!task.id || !task.title || !task.prompt || !task.expected?.slot) {
		throw new Error("Benchmark task requires id, title, prompt, and expected.slot.");
	}
	if (!["inspect", "modify", "execute", "meta"].includes(task.expected.slot)) {
		throw new Error(`Unsupported benchmark slot "${task.expected.slot}".`);
	}
	if (task.execution) {
		const execution = task.execution;
		if (execution.type === "run_command" && execution.command.length === 0) {
			throw new Error(`Benchmark task "${task.id}" run_command execution requires at least one command token.`);
		}
		if (
			(execution.type === "read" || execution.type === "list_files" || execution.type === "search") &&
			!execution.target
		) {
			throw new Error(`Benchmark task "${task.id}" execution requires a target path.`);
		}
	}
	return task as BenchmarkTask;
}

function actionToToolName(slot: BenchmarkSlot, action: string | undefined): string {
	return `${slot}__${action ?? "none"}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildLiveTools(tasks: BenchmarkTask[]): LiveToolDefinition[] {
	const unique = new Map<string, { slot: BenchmarkSlot; action?: string }>();
	for (const task of tasks) {
		const key = actionToToolName(task.expected.slot, task.expected.action);
		if (!unique.has(key)) {
			unique.set(key, { slot: task.expected.slot, action: task.expected.action });
		}
	}
	return Array.from(unique.entries()).map(([name, value]) => ({
		type: "function",
		function: {
			name,
			description: `Benchmark slot=${value.slot}; action=${value.action ?? "none"}`,
			parameters: {
				type: "object",
				properties: {
					reason: { type: "string" },
				},
				required: ["reason"],
			},
		},
	}));
}

function decodeToolName(toolName: string): { slot?: BenchmarkSlot; action?: string } {
	const split = toolName.split("__");
	if (split.length < 2) {
		return {};
	}
	const slotRaw = split[0];
	if (slotRaw !== "inspect" && slotRaw !== "modify" && slotRaw !== "execute" && slotRaw !== "meta") {
		return {};
	}
	const actionRaw = split.slice(1).join("__");
	return { slot: slotRaw, action: actionRaw === "none" ? undefined : actionRaw };
}

async function requestChatCompletion(
	options: LocalBenchmarkRunOptions,
	body: Record<string, unknown>,
	timeoutMs: number,
): Promise<{ status: number; parsed?: ChatCompletionResponse; errorClass?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`${normalizeApiBaseUrl(options.baseUrl)}/chat/completions`, {
			method: "POST",
			headers: buildHeaders(options.apiKey),
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		const text = await response.text();
		if (response.status < 200 || response.status >= 300) {
			return { status: response.status, errorClass: "http_error" };
		}
		const parsed = parseJson(text);
		if (!parsed) {
			return { status: response.status, errorClass: "invalid_json" };
		}
		return { status: response.status, parsed };
	} catch (error) {
		const isAbort = error instanceof Error && error.name === "AbortError";
		return { status: 0, errorClass: isAbort ? "timeout" : "request_failed" };
	} finally {
		clearTimeout(timeout);
	}
}

function ratioFromUsage(totalTokens: number | undefined, fallback: number): number {
	if (!totalTokens || totalTokens <= 0) {
		return fallback;
	}
	return Math.min(0.98, Math.max(0.05, totalTokens / 32_768));
}

export function loadBenchmarkTasks(tasksPath?: string, cwd: string = process.cwd()): BenchmarkTask[] {
	const resolvedPath = tasksPath ?? resolveDefaultTaskPath(cwd);
	if (!existsSync(resolvedPath)) {
		throw new Error(`Benchmark task file not found: ${resolvedPath}`);
	}
	const raw = readFileSync(resolvedPath, "utf-8");
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error("Benchmark task file must contain a JSON array.");
	}
	return parsed.map(assertBenchmarkTask);
}

export type LocalBenchmarkRunOptions = {
	baseUrl: string;
	model: string;
	apiKey?: string;
	backendHint: string;
	timeoutMs: number;
	tasksPath?: string;
	cwd?: string;
	mode?: "simulate" | "live";
};

function summarizeTaskDistribution(tasks: BenchmarkTask[]): string[] {
	const notes: string[] = [];
	const slots: BenchmarkSlot[] = ["inspect", "modify", "execute", "meta"];
	const counts = Object.fromEntries(slots.map((slot) => [slot, 0])) as Record<BenchmarkSlot, number>;
	for (const task of tasks) {
		counts[task.expected.slot]++;
	}
	if (tasks.length === 20) {
		const balanced = slots.every((slot) => counts[slot] === 5);
		if (balanced) {
			notes.push("Reference task distribution validated: 20 tasks, 5 per slot.");
		} else {
			notes.push(
				`Task distribution warning: expected 5 per slot, got inspect=${counts.inspect}, modify=${counts.modify}, execute=${counts.execute}, meta=${counts.meta}.`,
			);
		}
	} else {
		notes.push(`Custom task set detected: ${tasks.length} tasks.`);
	}
	return notes;
}

function buildDeterministicTaskResult(
	task: BenchmarkTask,
	taskIndex: number,
	capabilities: ProbedCapabilities,
): BenchmarkTaskResult {
	const slotValid = task.expected.slot === "meta" ? true : capabilities.toolCalling;
	const actionRequiresSchema = task.expected.action !== undefined && task.expected.action !== "run_command";
	const actionValid = task.expected.action
		? capabilities.toolCalling && (!actionRequiresSchema || capabilities.jsonSchema)
		: slotValid;
	const maxRepairs = task.expected.maxRepairs ?? 2;
	const canSucceed = capabilities.connectivity && slotValid && actionValid;
	const attempts = canSucceed ? 1 : Math.max(1, Math.min(maxRepairs + 1, 3));

	const toolExecutions: ToolExecutionRecord[] = [];
	const turns: TurnTelemetryRecord[] = [];
	let contextBefore = Math.min(0.88, 0.34 + taskIndex * 0.012);
	for (let turnIndex = 0; turnIndex < attempts; turnIndex++) {
		const success = canSucceed && turnIndex === attempts - 1;
		const latencyMs = 8 + taskIndex * 3 + turnIndex * 2;
		const errorClass = success ? undefined : capabilities.connectivity ? "capability_mismatch" : "connectivity_error";
		toolExecutions.push({
			taskId: task.id,
			turnIndex,
			slot: task.expected.slot,
			action: task.expected.action,
			latencyMs,
			repairAttempt: turnIndex,
			success,
			errorClass,
		});
		const contextAfter = success ? Math.max(0.2, contextBefore - 0.06) : Math.min(0.96, contextBefore + 0.035);
		turns.push({
			taskId: task.id,
			turnIndex,
			contextRatioBefore: contextBefore,
			contextRatioAfter: contextAfter,
			adapter: task.expected.slot === "execute" ? "host" : "none",
			metaReason: success ? undefined : "escalate",
			errorClass,
		});
		contextBefore = contextAfter;
	}

	const repairCount = Math.max(0, attempts - 1);
	const ok = canSucceed && repairCount <= maxRepairs;
	return {
		taskId: task.id,
		ok,
		slot: task.expected.slot,
		action: task.expected.action,
		slotValid,
		actionValid,
		repairCount,
		latencyMs: toolExecutions.reduce((sum, record) => sum + record.latencyMs, 0),
		errorClass: ok ? undefined : capabilities.connectivity ? "capability_mismatch" : "connectivity_error",
		metaReason: ok ? undefined : "escalate_capability_mismatch",
		executionValidated: task.execution ? ok : undefined,
		executionEvidence: task.execution ? "simulated" : undefined,
		toolExecutions,
		turns,
	};
}

async function buildLiveTaskResult(
	task: BenchmarkTask,
	options: LocalBenchmarkRunOptions,
	liveTools: LiveToolDefinition[],
): Promise<BenchmarkTaskResult> {
	const maxRepairs = task.expected.maxRepairs ?? 2;
	let repairCount = 0;
	const toolExecutions: ToolExecutionRecord[] = [];
	const turns: TurnTelemetryRecord[] = [];
	let previousToolName: string | undefined;
	let previousErrorClass: string | undefined;
	let contextBefore = 0.35;

	for (let attempt = 0; attempt <= maxRepairs; attempt++) {
		const prompt =
			attempt === 0
				? `Task: ${task.title}\nInstruction: ${task.prompt}\nSelect exactly one best tool.`
				: `Repair attempt ${attempt}: previous tool ${previousToolName ?? "none"} failed with ${previousErrorClass ?? "unknown"}. Select the correct tool now.`;
		const started = Date.now();
		const response = await requestChatCompletion(
			options,
			{
				model: options.model,
				temperature: 0,
				max_tokens: 120,
				stream: false,
				messages: [
					{ role: "system", content: "You are a benchmark agent. Return exactly one tool call." },
					{ role: "user", content: prompt },
				],
				tools: liveTools,
				tool_choice: "auto",
			},
			options.timeoutMs,
		);
		const latencyMs = Math.max(1, Date.now() - started);
		const toolCall = response.parsed?.choices?.[0]?.message?.tool_calls?.[0];
		const toolName = toolCall?.function?.name;
		const decoded = toolName ? decodeToolName(toolName) : {};
		const slotValid = decoded.slot === task.expected.slot;
		const actionValid = (decoded.action ?? undefined) === (task.expected.action ?? undefined);
		let success = slotValid && actionValid;
		let errorClass = success ? undefined : (response.errorClass ?? (toolName ? "mismatch" : "missing_tool_call"));
		let executionValidated: boolean | undefined;
		let executionEvidence: string | undefined;

		if (success && task.execution) {
			const executionResult = await executeBenchmarkAction(
				task.execution,
				options.cwd ?? process.cwd(),
				Math.min(options.timeoutMs, 15_000),
			);
			executionValidated = executionResult.ok;
			executionEvidence = executionResult.evidence;
			success = executionResult.ok;
			if (!success) {
				errorClass = executionResult.errorClass ?? "execution_failed";
			}
		}

		toolExecutions.push({
			taskId: task.id,
			turnIndex: attempt,
			slot: task.expected.slot,
			action: task.expected.action,
			latencyMs,
			repairAttempt: attempt,
			success,
			errorClass,
		});

		const usageTokens = response.parsed?.usage?.total_tokens;
		const contextAfter = ratioFromUsage(
			usageTokens,
			success ? Math.max(0.2, contextBefore - 0.04) : contextBefore + 0.03,
		);
		turns.push({
			taskId: task.id,
			turnIndex: attempt,
			contextRatioBefore: contextBefore,
			contextRatioAfter: contextAfter,
			adapter: task.expected.slot === "execute" ? "host" : "none",
			metaReason: success ? undefined : "repair_or_escalate",
			errorClass,
		});
		contextBefore = contextAfter;

		if (success) {
			return {
				taskId: task.id,
				ok: true,
				slot: task.expected.slot,
				action: task.expected.action,
				slotValid: true,
				actionValid: true,
				repairCount,
				latencyMs: toolExecutions.reduce((sum, record) => sum + record.latencyMs, 0),
				executionValidated,
				executionEvidence,
				toolExecutions,
				turns,
			};
		}
		repairCount++;
		previousToolName = toolName;
		previousErrorClass = errorClass;
	}

	return {
		taskId: task.id,
		ok: false,
		slot: task.expected.slot,
		action: task.expected.action,
		slotValid: false,
		actionValid: false,
		repairCount,
		latencyMs: toolExecutions.reduce((sum, record) => sum + record.latencyMs, 0),
		errorClass: previousErrorClass ?? "repair_exhausted",
		metaReason: "escalate_repair_exhausted",
		executionValidated: task.execution ? false : undefined,
		toolExecutions,
		turns,
	};
}

export async function runLocalBenchmarkSuite(options: LocalBenchmarkRunOptions): Promise<BenchmarkReport> {
	const tasks = loadBenchmarkTasks(options.tasksPath, options.cwd);
	const capabilities = (await probeLocalCapabilities({
		baseUrl: options.baseUrl,
		model: options.model,
		apiKey: options.apiKey,
		backendHint: options.backendHint,
		timeoutMs: options.timeoutMs,
	})) as ProbedCapabilities;

	const mode = options.mode ?? "simulate";
	let results: BenchmarkTaskResult[];
	if (mode === "live") {
		const liveTools = buildLiveTools(tasks);
		results = [];
		for (const task of tasks) {
			results.push(await buildLiveTaskResult(task, options, liveTools));
		}
	} else {
		results = tasks.map((task, index) => buildDeterministicTaskResult(task, index, capabilities));
	}

	const notes = [
		mode === "live"
			? "Live benchmark mode: real chat-completion tool-call loop with bounded repairs."
			: "Deterministic benchmark mode with simulated tool and turn telemetry.",
		"Next step: execute selected tools in sandbox/host adapters and collect command-level telemetry.",
		...summarizeTaskDistribution(tasks),
	];
	return buildBenchmarkReport({
		backendHint: options.backendHint,
		model: options.model,
		results,
		notes,
	});
}
