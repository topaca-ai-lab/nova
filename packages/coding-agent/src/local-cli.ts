import { type DoctorReport, getLocalRuntimeProfile, probeLocalCapabilities } from "@nova-ai/nova-ai";
import chalk from "chalk";
import { APP_NAME } from "./config.js";
import { diffBenchmarkReports } from "./core/local/benchmark-diff.js";
import { runLocalBenchmarkSuite } from "./core/local/benchmark-runner.js";
import {
	latestBenchmarkSummaryMatrix,
	resolveBenchmarkArtifactRef,
	saveBenchmarkReportArtifact,
	writeBenchmarkReportToPath,
} from "./core/local/benchmark-storage.js";
import type { BenchmarkReport } from "./core/local/benchmark-types.js";

interface LocalDoctorOptions {
	json: boolean;
	baseUrl: string;
	model: string;
	apiKey?: string;
	backendHint: string;
	timeoutMs: number;
	help: boolean;
	invalidOption?: string;
}

interface LocalInspectOptions {
	json: boolean;
	profileId?: string;
	withBench: boolean;
	help: boolean;
	invalidOption?: string;
}

interface LocalBenchRunOptions {
	json: boolean;
	live: boolean;
	out?: string;
	tag?: string;
	baseUrl: string;
	model: string;
	apiKey?: string;
	backendHint: string;
	timeoutMs: number;
	tasksPath?: string;
	help: boolean;
	invalidOption?: string;
}

interface LocalBenchDiffOptions {
	json: boolean;
	help: boolean;
	invalidOption?: string;
	leftRef?: string;
	rightRef?: string;
}

function isTruthy(value: string | undefined): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function resolveDefaultBaseUrl(): string {
	return (
		process.env.NOVA_LOCAL_BASE_URL ||
		process.env.LITELLM_BASE_URL ||
		process.env.OPENAI_BASE_URL ||
		"http://localhost:4000"
	);
}

function resolveDefaultModel(): string {
	return process.env.NOVA_LOCAL_MODEL || "qwen3.6";
}

function resolveDefaultBackendHint(): string {
	return process.env.NOVA_LOCAL_BACKEND || "LiteLLM+Ollama";
}

function resolveDefaultTimeoutMs(): number {
	const parsed = Number.parseInt(process.env.NOVA_LOCAL_TIMEOUT_MS || "", 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return 20_000;
}

function printLocalDoctorHelp(): void {
	console.log(`${chalk.bold("Usage:")}
  ${APP_NAME} local doctor [options]

Probe local OpenAI-compatible runtime capabilities and suggest a runtime profile.

${chalk.bold("Options:")}
  --json                 Output machine-readable JSON report
  --base-url <url>       Runtime base URL (default: NOVA_LOCAL_BASE_URL, LITELLM_BASE_URL, OPENAI_BASE_URL, or http://localhost:4000)
  --model <id>           Model ID to probe (default: NOVA_LOCAL_MODEL or qwen3.6)
  --api-key <key>        API key (default: NOVA_LOCAL_API_KEY or OPENAI_API_KEY)
  --backend <hint>       Backend hint for profile recommendation (default: NOVA_LOCAL_BACKEND or LiteLLM+Ollama)
  --timeout-ms <ms>      Probe timeout in milliseconds (default: NOVA_LOCAL_TIMEOUT_MS or 20000)
  -h, --help             Show this help

${chalk.bold("Examples:")}
  ${APP_NAME} local doctor
  ${APP_NAME} local doctor --json
  ${APP_NAME} local doctor --base-url http://localhost:4000 --model qwen3.6
  ${APP_NAME} local doctor --backend "LiteLLM+Ollama" --timeout-ms 30000
`);
}

function printLocalInspectHelp(): void {
	console.log(`${chalk.bold("Usage:")}
  ${APP_NAME} local inspect [options]

Show resolved local runtime profile and profile capabilities.

${chalk.bold("Options:")}
  --json                 Output machine-readable JSON
  --profile <id>         Runtime profile ID (default: NOVA_LOCAL_PROFILE, else ollama_openai_compat)
  --no-bench             Hide latest benchmark matrix in text mode
  -h, --help             Show this help

${chalk.bold("Examples:")}
  ${APP_NAME} local inspect
  ${APP_NAME} local inspect --profile ollama_openai_compat
  ${APP_NAME} local inspect --json
`);
}

function printLocalBenchHelp(): void {
	console.log(`${chalk.bold("Usage:")}
  ${APP_NAME} local bench run [options]
  ${APP_NAME} local bench diff <older> <newer> [options]

Run deterministic local benchmark tasks and emit a benchmark report.

${chalk.bold("Options:")}
  --json                 Output machine-readable JSON report
  --live                 Run real chat-completion benchmark loop (not simulation)
  --out <path>           Write run report to custom JSON path
  --tag <name>           Add tag suffix to stored artifact id
  --tasks <path>         Path to benchmark task file (JSON array)
  --base-url <url>       Runtime base URL (default: NOVA_LOCAL_BASE_URL, LITELLM_BASE_URL, OPENAI_BASE_URL, or http://localhost:4000)
  --model <id>           Model ID to probe (default: NOVA_LOCAL_MODEL or qwen3.6)
  --api-key <key>        API key (default: NOVA_LOCAL_API_KEY or OPENAI_API_KEY)
  --backend <hint>       Backend hint for report metadata (default: NOVA_LOCAL_BACKEND or LiteLLM+Ollama)
  --timeout-ms <ms>      Probe timeout in milliseconds (default: NOVA_LOCAL_TIMEOUT_MS or 20000)
  -h, --help             Show this help

${chalk.bold("Examples:")}
  ${APP_NAME} local bench run
  ${APP_NAME} local bench run --json
  ${APP_NAME} local bench run --live --tag vllm-qwen
  ${APP_NAME} local bench run --tasks ./packages/coding-agent/bench/tasks/reference-v1.json
  ${APP_NAME} local bench diff 20260423T170000Z-vllm-qwen-live 20260423T180000Z-vllm-qwen-live
`);
}

function parseLocalDoctorOptions(args: string[]): LocalDoctorOptions {
	const options: LocalDoctorOptions = {
		json: false,
		baseUrl: resolveDefaultBaseUrl(),
		model: resolveDefaultModel(),
		apiKey: process.env.NOVA_LOCAL_API_KEY || process.env.OPENAI_API_KEY,
		backendHint: resolveDefaultBackendHint(),
		timeoutMs: resolveDefaultTimeoutMs(),
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			options.help = true;
			continue;
		}
		if (arg === "--base-url" && i + 1 < args.length) {
			options.baseUrl = args[++i];
			continue;
		}
		if (arg === "--model" && i + 1 < args.length) {
			options.model = args[++i];
			continue;
		}
		if (arg === "--api-key" && i + 1 < args.length) {
			options.apiKey = args[++i];
			continue;
		}
		if (arg === "--backend" && i + 1 < args.length) {
			options.backendHint = args[++i];
			continue;
		}
		if (arg === "--timeout-ms" && i + 1 < args.length) {
			const parsed = Number.parseInt(args[++i], 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				options.timeoutMs = parsed;
			} else {
				options.invalidOption = "--timeout-ms";
			}
			continue;
		}

		options.invalidOption = arg;
	}

	return options;
}

function parseLocalInspectOptions(args: string[]): LocalInspectOptions {
	const options: LocalInspectOptions = {
		json: false,
		profileId: process.env.NOVA_LOCAL_PROFILE || undefined,
		withBench: true,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			options.help = true;
			continue;
		}
		if (arg === "--profile" && i + 1 < args.length) {
			options.profileId = args[++i];
			continue;
		}
		if (arg === "--no-bench") {
			options.withBench = false;
			continue;
		}
		options.invalidOption = arg;
	}

	return options;
}

function parseLocalBenchRunOptions(args: string[]): LocalBenchRunOptions {
	const options: LocalBenchRunOptions = {
		json: false,
		live: false,
		baseUrl: resolveDefaultBaseUrl(),
		model: resolveDefaultModel(),
		apiKey: process.env.NOVA_LOCAL_API_KEY || process.env.OPENAI_API_KEY,
		backendHint: resolveDefaultBackendHint(),
		timeoutMs: resolveDefaultTimeoutMs(),
		help: false,
	};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--live") {
			options.live = true;
			continue;
		}
		if (arg === "--out" && i + 1 < args.length) {
			options.out = args[++i];
			continue;
		}
		if (arg === "--tag" && i + 1 < args.length) {
			options.tag = args[++i];
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			options.help = true;
			continue;
		}
		if (arg === "--tasks" && i + 1 < args.length) {
			options.tasksPath = args[++i];
			continue;
		}
		if (arg === "--base-url" && i + 1 < args.length) {
			options.baseUrl = args[++i];
			continue;
		}
		if (arg === "--model" && i + 1 < args.length) {
			options.model = args[++i];
			continue;
		}
		if (arg === "--api-key" && i + 1 < args.length) {
			options.apiKey = args[++i];
			continue;
		}
		if (arg === "--backend" && i + 1 < args.length) {
			options.backendHint = args[++i];
			continue;
		}
		if (arg === "--timeout-ms" && i + 1 < args.length) {
			const parsed = Number.parseInt(args[++i], 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				options.timeoutMs = parsed;
			} else {
				options.invalidOption = "--timeout-ms";
			}
			continue;
		}
		options.invalidOption = arg;
	}
	return options;
}

function parseLocalBenchDiffOptions(args: string[]): LocalBenchDiffOptions {
	const options: LocalBenchDiffOptions = {
		json: false,
		help: false,
	};
	const positional: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			options.help = true;
			continue;
		}
		if (arg.startsWith("-")) {
			options.invalidOption = arg;
			continue;
		}
		positional.push(arg);
	}
	if (positional[0]) options.leftRef = positional[0];
	if (positional[1]) options.rightRef = positional[1];
	return options;
}

function renderBoolean(flag: boolean): string {
	return flag ? chalk.green("yes") : chalk.red("no");
}

function printLocalInspect(profileId: string, json: boolean, withBench: boolean): void {
	const profile = getLocalRuntimeProfile(profileId);
	if (!profile) {
		throw new Error(`Unknown local profile: ${profileId}`);
	}
	if (json) {
		const matrix = withBench ? latestBenchmarkSummaryMatrix() : [];
		console.log(JSON.stringify({ profile, benchMatrix: matrix }, null, 2));
		return;
	}

	console.log(chalk.bold("Nova Local Inspect"));
	console.log(`Profile: ${chalk.cyan(profile.id)}`);
	console.log(`Backend: ${profile.backendType}`);
	console.log(`Streaming: ${renderBoolean(profile.supportsStreaming)}`);
	console.log(`Tool calling: ${renderBoolean(profile.supportsTools)}`);
	console.log(`JSON schema: ${renderBoolean(profile.supportsJsonSchema)}`);
	console.log(`System role: ${renderBoolean(profile.supportsSystemRole)}`);
	console.log(`Developer role: ${renderBoolean(profile.supportsDeveloperRole)}`);
	console.log(`Reasoning effort: ${renderBoolean(profile.supportsReasoningEffort)}`);
	console.log(`Tool mode: ${profile.toolCallMode}`);
	if (profile.compatNotes && profile.compatNotes.length > 0) {
		console.log(chalk.dim("Notes:"));
		for (const note of profile.compatNotes) {
			console.log(`- ${note}`);
		}
	}
	if (withBench) {
		const matrix = latestBenchmarkSummaryMatrix();
		if (matrix.length > 0) {
			console.log(chalk.dim("Latest Benchmark Matrix:"));
			for (const item of matrix) {
				console.log(
					`- ${item.backendHint} / ${item.model}: pass ${(item.passRate * 100).toFixed(1)}%, exec ${(item.executionValidationRate * 100).toFixed(1)}%, repairs ${item.averageRepairCount.toFixed(2)} [${item.artifactId}]`,
				);
			}
		}
	}
}

function printDoctorReport(report: DoctorReport, backendHint: string): void {
	console.log(chalk.bold("Nova Local Doctor"));
	console.log(`Backend hint: ${backendHint}`);
	console.log(`Model: ${report.model}`);
	console.log(`Connectivity: ${renderBoolean(report.connectivity)}`);
	console.log(`Streaming: ${renderBoolean(report.streaming)}`);
	console.log(`Tool calling: ${renderBoolean(report.toolCalling)}`);
	console.log(`Tool calling (auto): ${renderBoolean(report.toolCallingAuto)}`);
	console.log(`Tool calling (forced): ${renderBoolean(report.toolCallingForced)}`);
	console.log(`JSON schema: ${renderBoolean(report.jsonSchema)}`);
	console.log(`System role: ${renderBoolean(report.systemRole)}`);
	console.log(`Developer role: ${renderBoolean(report.developerRole)}`);
	console.log(`Tool parser: ${renderBoolean(report.toolParser)}`);
	console.log(`Reasoning parser: ${renderBoolean(report.reasoningParser)}`);
	if (report.recommendedProfile) {
		const profile = getLocalRuntimeProfile(report.recommendedProfile);
		console.log(`Recommended profile: ${chalk.cyan(report.recommendedProfile)}`);
		if (profile?.compatNotes && profile.compatNotes.length > 0) {
			console.log(`Profile note: ${profile.compatNotes[0]}`);
		}
	}
	if (report.warnings.length > 0) {
		console.log(chalk.yellow("Warnings:"));
		for (const warning of report.warnings) {
			console.log(`- ${warning}`);
		}
	}
	if (report.notes.length > 0) {
		console.log(chalk.dim("Notes:"));
		for (const note of report.notes) {
			console.log(`- ${note}`);
		}
	}
}

function printBenchReport(report: BenchmarkReport): void {
	console.log(chalk.bold("Nova Local Bench"));
	console.log(`Model: ${report.model}`);
	console.log(`Backend hint: ${report.backendHint}`);
	console.log(`Tasks: ${report.passedTasks}/${report.totalTasks} passed`);
	console.log(`Pass rate: ${(report.passRate * 100).toFixed(1)}%`);
	console.log(`Average latency: ${report.averageLatencyMs.toFixed(1)} ms`);
	console.log(`Average repair count: ${report.averageRepairCount.toFixed(2)}`);
	console.log(`Action validity: ${(report.actionValidityRate * 100).toFixed(1)}%`);
	console.log(`Execution validation: ${(report.executionValidationRate * 100).toFixed(1)}%`);
	console.log(
		`Slot validity: inspect ${(report.slotValidityRate.inspect * 100).toFixed(1)}%, modify ${(report.slotValidityRate.modify * 100).toFixed(1)}%, execute ${(report.slotValidityRate.execute * 100).toFixed(1)}%, meta ${(report.slotValidityRate.meta * 100).toFixed(1)}%`,
	);
	console.log(
		`Telemetry: tool calls ${report.telemetry.summary.toolCalls}, success ${(report.telemetry.summary.toolSuccessRate * 100).toFixed(1)}%, repair failures ${report.telemetry.summary.repairFailures}`,
	);
	console.log(
		`Context ratio avg before/after: ${report.telemetry.summary.averageContextRatioBefore.toFixed(3)} / ${report.telemetry.summary.averageContextRatioAfter.toFixed(3)}`,
	);
	if (report.notes.length > 0) {
		console.log(chalk.dim("Notes:"));
		for (const note of report.notes) {
			console.log(`- ${note}`);
		}
	}
}

function printBenchDiff(diff: ReturnType<typeof diffBenchmarkReports>): void {
	console.log(chalk.bold("Nova Local Bench Diff"));
	console.log(`Older: ${diff.olderLabel}`);
	console.log(`Newer: ${diff.newerLabel}`);
	console.log(`Pass rate delta: ${(diff.metrics.passRateDelta * 100).toFixed(1)}%`);
	console.log(`Action validity delta: ${(diff.metrics.actionValidityDelta * 100).toFixed(1)}%`);
	console.log(`Execution validation delta: ${(diff.metrics.executionValidationDelta * 100).toFixed(1)}%`);
	console.log(`Tool success delta: ${(diff.metrics.toolSuccessRateDelta * 100).toFixed(1)}%`);
	console.log(`Latency delta: ${diff.metrics.averageLatencyDeltaMs.toFixed(1)} ms`);
	console.log(`Repair delta: ${diff.metrics.averageRepairCountDelta.toFixed(2)}`);
	if (diff.regressions.length > 0) {
		console.log(chalk.yellow(`Regressions: ${diff.regressions.join(", ")}`));
	}
}

export async function handleLocalCommand(args: string[]): Promise<boolean> {
	if (args[0] !== "local") {
		return false;
	}

	const subcommand = args[1];
	if (subcommand === "doctor") {
		const doctorOptions = parseLocalDoctorOptions(args.slice(2));
		if (doctorOptions.help) {
			printLocalDoctorHelp();
			return true;
		}
		if (doctorOptions.invalidOption) {
			console.error(chalk.red(`Invalid option: ${doctorOptions.invalidOption}`));
			console.error(chalk.dim(`Usage: ${APP_NAME} local doctor [options]`));
			process.exitCode = 1;
			return true;
		}

		try {
			const report = await probeLocalCapabilities({
				baseUrl: doctorOptions.baseUrl,
				model: doctorOptions.model,
				apiKey: doctorOptions.apiKey,
				backendHint: doctorOptions.backendHint,
				timeoutMs: doctorOptions.timeoutMs,
			});

			if (doctorOptions.json || isTruthy(process.env.NOVA_LOCAL_DOCTOR_JSON)) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				printDoctorReport(report, doctorOptions.backendHint);
			}

			if (!report.connectivity) {
				process.exitCode = 1;
			}
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown local doctor error";
			console.error(chalk.red(`local doctor failed: ${message}`));
			process.exitCode = 1;
			return true;
		}
	}

	if (subcommand === "inspect") {
		const inspectOptions = parseLocalInspectOptions(args.slice(2));
		if (inspectOptions.help) {
			printLocalInspectHelp();
			return true;
		}
		if (inspectOptions.invalidOption) {
			console.error(chalk.red(`Invalid option: ${inspectOptions.invalidOption}`));
			console.error(chalk.dim(`Usage: ${APP_NAME} local inspect [options]`));
			process.exitCode = 1;
			return true;
		}
		try {
			printLocalInspect(
				inspectOptions.profileId || "ollama_openai_compat",
				inspectOptions.json,
				inspectOptions.withBench,
			);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown local inspect error";
			console.error(chalk.red(`local inspect failed: ${message}`));
			process.exitCode = 1;
			return true;
		}
	}

	if (subcommand === "bench") {
		const benchSubcommand = args[2];
		if (benchSubcommand !== "run" && benchSubcommand !== "diff") {
			console.error(chalk.red(`Unknown local bench subcommand: ${args[2] ?? "(missing)"}`));
			console.error(
				chalk.dim(`Usage: ${APP_NAME} local bench run [options] | local bench diff <older> <newer> [options]`),
			);
			process.exitCode = 1;
			return true;
		}
		if (benchSubcommand === "run") {
			const benchOptions = parseLocalBenchRunOptions(args.slice(3));
			if (benchOptions.help) {
				printLocalBenchHelp();
				return true;
			}
			if (benchOptions.invalidOption) {
				console.error(chalk.red(`Invalid option: ${benchOptions.invalidOption}`));
				console.error(chalk.dim(`Usage: ${APP_NAME} local bench run [options]`));
				process.exitCode = 1;
				return true;
			}
			try {
				const report = await runLocalBenchmarkSuite({
					baseUrl: benchOptions.baseUrl,
					model: benchOptions.model,
					apiKey: benchOptions.apiKey,
					backendHint: benchOptions.backendHint,
					timeoutMs: benchOptions.timeoutMs,
					tasksPath: benchOptions.tasksPath,
					mode: benchOptions.live ? "live" : "simulate",
				});
				const artifact = saveBenchmarkReportArtifact(report, {
					mode: benchOptions.live ? "live" : "simulate",
					tag: benchOptions.tag,
				});
				const outPath = benchOptions.out ? writeBenchmarkReportToPath(report, benchOptions.out) : undefined;
				if (benchOptions.out) {
					// already written via writeBenchmarkReportToPath above
				}
				if (benchOptions.json) {
					console.log(
						JSON.stringify({ report, artifactId: artifact.id, artifactPath: artifact.path, outPath }, null, 2),
					);
				} else {
					printBenchReport(report);
					console.log(chalk.dim(`Saved artifact: ${artifact.id}`));
					if (outPath) {
						console.log(chalk.dim(`Wrote report to: ${outPath}`));
					}
				}
				if (report.passRate < 0.95 || report.executionValidationRate < 0.95) {
					process.exitCode = 1;
				}
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown local bench error";
				console.error(chalk.red(`local bench failed: ${message}`));
				process.exitCode = 1;
				return true;
			}
		}

		const diffOptions = parseLocalBenchDiffOptions(args.slice(3));
		if (diffOptions.help) {
			printLocalBenchHelp();
			return true;
		}
		if (diffOptions.invalidOption) {
			console.error(chalk.red(`Invalid option: ${diffOptions.invalidOption}`));
			console.error(chalk.dim(`Usage: ${APP_NAME} local bench diff <older> <newer> [options]`));
			process.exitCode = 1;
			return true;
		}
		if (!diffOptions.leftRef || !diffOptions.rightRef) {
			console.error(chalk.red("Missing benchmark artifact references for diff."));
			console.error(chalk.dim(`Usage: ${APP_NAME} local bench diff <older> <newer> [options]`));
			process.exitCode = 1;
			return true;
		}
		const older = resolveBenchmarkArtifactRef(diffOptions.leftRef);
		const newer = resolveBenchmarkArtifactRef(diffOptions.rightRef);
		if (!older || !newer) {
			console.error(chalk.red("Could not resolve one or both benchmark artifact references."));
			process.exitCode = 1;
			return true;
		}
		const diff = diffBenchmarkReports(older.report, newer.report, {
			olderLabel: older.id,
			newerLabel: newer.id,
		});
		if (diffOptions.json) {
			console.log(JSON.stringify(diff, null, 2));
		} else {
			printBenchDiff(diff);
		}
		if (diff.regressed) {
			process.exitCode = 1;
		}
		return true;
	}

	console.error(chalk.red(`Unknown local subcommand: ${subcommand ?? "(missing)"}`));
	console.error(
		chalk.dim(
			`Usage: ${APP_NAME} local doctor [options] | local inspect [options] | local bench run [options] | local bench diff <older> <newer> [options]`,
		),
	);
	process.exitCode = 1;
	return true;
}
