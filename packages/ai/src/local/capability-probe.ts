import { getLocalRuntimeProfile } from "./builtin-profiles.js";
import type { LocalRuntimeProfile } from "./runtime-profile.js";

export type ProbeHttpRequest = {
	method: "GET" | "POST";
	url: string;
	headers?: Record<string, string>;
	body?: unknown;
	timeoutMs?: number;
};

export type ProbeHttpResponse = {
	status: number;
	headers: Record<string, string>;
	bodyText: string;
};

export type ProbeHttpClient = (request: ProbeHttpRequest) => Promise<ProbeHttpResponse>;

export type DoctorReport = {
	backend: string;
	model: string;
	connectivity: boolean;
	streaming: boolean;
	toolCallingAuto: boolean;
	toolCallingForced: boolean;
	toolCalling: boolean;
	jsonSchema: boolean;
	systemRole: boolean;
	developerRole: boolean;
	reasoningParser: boolean;
	toolParser: boolean;
	recommendedProfile?: string;
	warnings: string[];
	notes: string[];
};

export type CapabilityProbeInput = {
	baseUrl: string;
	model: string;
	apiKey?: string;
	backendHint?: string;
	timeoutMs?: number;
	httpClient?: ProbeHttpClient;
};

type OpenAIMessage = {
	role: "system" | "developer" | "user";
	content: string;
};

type BackendKind = "litellm" | "ollama" | "vllm" | "sglang" | "openai_compat" | "unknown";

function normalizeRootBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/v1")) {
		return trimmed.slice(0, -3);
	}
	return trimmed;
}

function normalizeApiBaseUrl(baseUrl: string): string {
	const root = normalizeRootBaseUrl(baseUrl);
	return `${root}/v1`;
}

function buildHeaders(apiKey?: string): Record<string, string> {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
	}
	return headers;
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function hasToolCallInResponse(parsed: unknown): boolean {
	if (!parsed || typeof parsed !== "object") return false;
	const maybeChoices = (parsed as { choices?: unknown }).choices;
	if (!Array.isArray(maybeChoices) || maybeChoices.length === 0) return false;
	const first = maybeChoices[0];
	if (!first || typeof first !== "object") return false;
	const message = (first as { message?: unknown }).message;
	if (!message || typeof message !== "object") return false;
	const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
	return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function isSuccess(status: number): boolean {
	return status >= 200 && status < 300;
}

function defaultHttpClient(): ProbeHttpClient {
	return async (request) => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 20_000);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: request.headers,
				body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
				signal: controller.signal,
			});
			const headerRecord: Record<string, string> = {};
			for (const [key, value] of response.headers.entries()) {
				headerRecord[key.toLowerCase()] = value;
			}
			return {
				status: response.status,
				headers: headerRecord,
				bodyText: await response.text(),
			};
		} finally {
			clearTimeout(timeout);
		}
	};
}

function buildSimpleChatBody(model: string, messages: OpenAIMessage[]) {
	return {
		model,
		messages,
		temperature: 0,
		max_tokens: 32,
		stream: false,
	};
}

function detectBackendKind(backendHint: string | undefined, baseUrl: string): BackendKind {
	const hint = backendHint?.toLowerCase() ?? "";
	const url = baseUrl.toLowerCase();

	if (hint.includes("litellm") || url.includes("litellm")) return "litellm";
	if (hint.includes("ollama") || url.includes("ollama")) return "ollama";
	if (hint.includes("vllm") || url.includes("vllm")) return "vllm";
	if (hint.includes("sglang") || url.includes("sglang")) return "sglang";
	if (hint.includes("openai")) return "openai_compat";
	return "unknown";
}

function pickRecommendedProfile(backendKind: BackendKind, toolCalling: boolean): string | undefined {
	if (backendKind === "litellm" || backendKind === "ollama") return "ollama_openai_compat";
	if (backendKind === "vllm") return "vllm_qwen3";
	if (backendKind === "sglang") return "sglang_qwen3";
	if (toolCalling) return "ollama_openai_compat";
	return undefined;
}

function hasParserHintInHeaders(headers: Record<string, string>): { toolParser: boolean; reasoningParser: boolean } {
	const toolParser =
		typeof headers["x-tool-parser"] === "string" ||
		typeof headers["x-litellm-tool-parser"] === "string" ||
		typeof headers["x-vllm-tool-parser"] === "string";
	const reasoningParser =
		typeof headers["x-reasoning-parser"] === "string" ||
		typeof headers["x-litellm-reasoning-parser"] === "string" ||
		typeof headers["x-vllm-reasoning-parser"] === "string";
	return { toolParser, reasoningParser };
}

function hasParserHintInBodyText(bodyText: string): { toolParser: boolean; reasoningParser: boolean } {
	const normalized = bodyText.toLowerCase();
	return {
		toolParser:
			normalized.includes("tool parser") ||
			normalized.includes("tool_call_parser") ||
			normalized.includes("qwen3_coder"),
		reasoningParser:
			normalized.includes("reasoning parser") ||
			normalized.includes("reasoning_parser") ||
			normalized.includes("qwen3"),
	};
}

async function safeRequest(
	client: ProbeHttpClient,
	request: ProbeHttpRequest,
	warnings: string[],
	context: string,
): Promise<ProbeHttpResponse | undefined> {
	try {
		return await client(request);
	} catch (error) {
		warnings.push(`${context} probe failed: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

async function runBackendSpecificProbes(
	backendKind: BackendKind,
	rootBaseUrl: string,
	headers: Record<string, string>,
	timeoutMs: number,
	client: ProbeHttpClient,
	notes: string[],
	warnings: string[],
): Promise<void> {
	if (backendKind === "litellm") {
		notes.push("Detected LiteLLM-style backend hint.");
		const healthResponse = await safeRequest(
			client,
			{ method: "GET", url: `${rootBaseUrl}/health`, headers, timeoutMs },
			warnings,
			"LiteLLM health",
		);
		if (healthResponse && isSuccess(healthResponse.status)) {
			notes.push("LiteLLM health endpoint is reachable.");
		}
		return;
	}

	if (backendKind === "ollama") {
		notes.push("Detected Ollama-style backend hint.");
		const ollamaTags = await safeRequest(
			client,
			{ method: "GET", url: `${rootBaseUrl}/api/tags`, headers: { "content-type": "application/json" }, timeoutMs },
			warnings,
			"Ollama tags",
		);
		if (ollamaTags && isSuccess(ollamaTags.status)) {
			notes.push("Ollama tags endpoint is reachable.");
		}
		return;
	}

	if (backendKind === "vllm" || backendKind === "sglang") {
		notes.push(`Detected ${backendKind} backend hint.`);
		const healthResponse = await safeRequest(
			client,
			{ method: "GET", url: `${rootBaseUrl}/health`, headers, timeoutMs },
			warnings,
			`${backendKind} health`,
		);
		if (healthResponse && isSuccess(healthResponse.status)) {
			notes.push(`${backendKind} health endpoint is reachable.`);
		}
		return;
	}
}

export async function probeLocalCapabilities(input: CapabilityProbeInput): Promise<DoctorReport> {
	const timeoutMs = input.timeoutMs ?? 20_000;
	const client = input.httpClient ?? defaultHttpClient();
	const rootBaseUrl = normalizeRootBaseUrl(input.baseUrl);
	const apiBaseUrl = normalizeApiBaseUrl(input.baseUrl);
	const headers = buildHeaders(input.apiKey);
	const notes: string[] = [];
	const warnings: string[] = [];
	const backendKind = detectBackendKind(input.backendHint, input.baseUrl);

	let connectivity = false;
	let streaming = false;
	let toolCallingAuto = false;
	let toolCallingForced = false;
	let toolCalling = false;
	let jsonSchema = false;
	let systemRole = false;
	let developerRole = false;
	let reasoningParser = false;
	let toolParser = false;

	const modelsResponse = await safeRequest(
		client,
		{ method: "GET", url: `${apiBaseUrl}/models`, headers, timeoutMs },
		warnings,
		"Model endpoint",
	);
	connectivity = modelsResponse ? isSuccess(modelsResponse.status) : false;
	if (modelsResponse && !connectivity) {
		warnings.push(`Model endpoint returned HTTP ${modelsResponse.status}.`);
	}

	if (connectivity) {
		const systemTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: buildSimpleChatBody(input.model, [
					{ role: "system", content: "You are a capability probe." },
					{ role: "user", content: "Reply with the word ok." },
				]),
				timeoutMs,
			},
			warnings,
			"System role",
		);
		systemRole = !!systemTest && isSuccess(systemTest.status);
		if (systemTest && !systemRole) {
			warnings.push(`System role probe failed with HTTP ${systemTest.status}.`);
		}

		const developerTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: buildSimpleChatBody(input.model, [
					{ role: "developer", content: "Follow developer instruction." },
					{ role: "user", content: "Reply with ok." },
				]),
				timeoutMs,
			},
			warnings,
			"Developer role",
		);
		developerRole = !!developerTest && isSuccess(developerTest.status);
		if (!developerRole) {
			notes.push("Developer role not accepted; fallback to system role is required.");
		}

		const streamTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: {
					...buildSimpleChatBody(input.model, [{ role: "user", content: "Reply with ok." }]),
					stream: true,
				},
				timeoutMs,
			},
			warnings,
			"Streaming",
		);
		streaming =
			!!streamTest &&
			isSuccess(streamTest.status) &&
			(streamTest.bodyText.includes("data:") || streamTest.bodyText.length > 0);
		if (!streaming) {
			notes.push("Streaming probe did not return SSE-like chunks.");
		}

		const toolAutoTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: {
					...buildSimpleChatBody(input.model, [{ role: "user", content: "Call the ping tool exactly once." }]),
					max_tokens: 256,
					tools: [
						{
							type: "function",
							function: {
								name: "ping",
								description: "Health check",
								parameters: {
									type: "object",
									properties: {
										message: { type: "string" },
									},
									required: ["message"],
								},
							},
						},
					],
					tool_choice: "auto",
				},
				timeoutMs,
			},
			warnings,
			"Tool calling auto",
		);
		if (toolAutoTest) {
			const toolParsed = safeJsonParse(toolAutoTest.bodyText);
			toolCallingAuto = isSuccess(toolAutoTest.status) && hasToolCallInResponse(toolParsed);
		}

		const toolForcedTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: {
					...buildSimpleChatBody(input.model, [
						{
							role: "system",
							content:
								"You are a tool calling assistant. When the user asks for weather, you must call get_weather. Do not answer directly.",
						},
						{ role: "user", content: "Wie ist das Wetter in Wien?" },
					]),
					max_tokens: 256,
					tools: [
						{
							type: "function",
							function: {
								name: "get_weather",
								description: "Get the current weather for a city.",
								parameters: {
									type: "object",
									properties: {
										city: { type: "string" },
									},
									required: ["city"],
								},
							},
						},
					],
					tool_choice: {
						type: "function",
						function: {
							name: "get_weather",
						},
					},
				},
				timeoutMs,
			},
			warnings,
			"Tool calling forced",
		);
		if (toolForcedTest) {
			const toolParsed = safeJsonParse(toolForcedTest.bodyText);
			toolCallingForced = isSuccess(toolForcedTest.status) && hasToolCallInResponse(toolParsed);
		}

		toolCalling = toolCallingAuto || toolCallingForced;
		if (!toolCallingAuto) {
			notes.push("Tool calling auto probe did not return tool_calls.");
		}
		if (!toolCallingForced) {
			notes.push("Tool calling forced probe did not return tool_calls.");
		}
		if (!toolCallingAuto && toolCallingForced) {
			notes.push("Tool calling is available with forced tool_choice; auto selection may be unsupported.");
		}

		const schemaTest = await safeRequest(
			client,
			{
				method: "POST",
				url: `${apiBaseUrl}/chat/completions`,
				headers,
				body: {
					...buildSimpleChatBody(input.model, [{ role: "user", content: "Return JSON with field ok=true." }]),
					response_format: {
						type: "json_schema",
						json_schema: {
							name: "probe_schema",
							schema: {
								type: "object",
								properties: { ok: { type: "boolean" } },
								required: ["ok"],
							},
							strict: true,
						},
					},
				},
				timeoutMs,
			},
			warnings,
			"JSON schema",
		);
		jsonSchema = !!schemaTest && isSuccess(schemaTest.status);
		if (!jsonSchema) {
			notes.push("JSON schema response_format was rejected.");
		}

		const mergedHeaders: Record<string, string> = {
			...(modelsResponse?.headers ?? {}),
			...(systemTest?.headers ?? {}),
			...(developerTest?.headers ?? {}),
			...(toolAutoTest?.headers ?? {}),
			...(toolForcedTest?.headers ?? {}),
		};
		const parserHeaderHints = hasParserHintInHeaders(mergedHeaders);
		const parserBodyHints = hasParserHintInBodyText(
			`${modelsResponse?.bodyText ?? ""}\n${toolAutoTest?.bodyText ?? ""}\n${toolForcedTest?.bodyText ?? ""}\n${schemaTest?.bodyText ?? ""}`,
		);
		toolParser = parserHeaderHints.toolParser || parserBodyHints.toolParser;
		reasoningParser = parserHeaderHints.reasoningParser || parserBodyHints.reasoningParser;
	}

	await runBackendSpecificProbes(backendKind, rootBaseUrl, headers, timeoutMs, client, notes, warnings);

	if ((backendKind === "vllm" || backendKind === "sglang") && !toolParser) {
		warnings.push("No parser hint detected for vLLM/SGLang backend; verify tool parser configuration.");
	}

	const recommendedProfile = pickRecommendedProfile(backendKind, toolCalling);
	const profile = recommendedProfile ? getLocalRuntimeProfile(recommendedProfile) : undefined;
	if (profile) {
		notes.push(`Recommended profile: ${profile.id}`);
	}

	return {
		backend: input.backendHint ?? "unknown",
		model: input.model,
		connectivity,
		streaming,
		toolCallingAuto,
		toolCallingForced,
		toolCalling,
		jsonSchema,
		systemRole,
		developerRole,
		reasoningParser,
		toolParser,
		recommendedProfile,
		warnings,
		notes,
	};
}

export function isProfileCompatibleWithDoctorReport(profile: LocalRuntimeProfile, report: DoctorReport): boolean {
	if (!report.connectivity) return false;
	if (profile.supportsStreaming && !report.streaming) return false;
	if (profile.supportsTools && !report.toolCalling) return false;
	if (profile.supportsJsonSchema && !report.jsonSchema) return false;
	if (profile.supportsSystemRole && !report.systemRole) return false;
	if (profile.supportsDeveloperRole && !report.developerRole) return false;
	if (profile.toolParser && !report.toolParser) return false;
	if (profile.reasoningParser && !report.reasoningParser) return false;
	return true;
}
