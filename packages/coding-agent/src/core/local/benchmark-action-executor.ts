import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkExecutionPlan } from "./benchmark-types.js";

export type BenchmarkExecutionResult = {
	ok: boolean;
	latencyMs: number;
	evidence?: string;
	errorClass?: string;
};

const ALLOWED_COMMANDS = new Set(["pwd", "node", "echo", "ls"]);

function normalizeEvidence(text: string, maxLength = 300): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength)}...`;
}

function executeCommand(parts: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const file = parts[0];
		const args = parts.slice(1);
		execFile(file, args, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
			if (error) {
				reject(error);
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

export async function executeBenchmarkAction(
	plan: BenchmarkExecutionPlan,
	cwd: string,
	timeoutMs: number,
): Promise<BenchmarkExecutionResult> {
	const started = Date.now();
	try {
		if (plan.type === "read") {
			const content = await readFile(join(cwd, plan.target), "utf-8");
			const ok = plan.expectContains ? content.includes(plan.expectContains) : content.length > 0;
			return {
				ok,
				latencyMs: Math.max(1, Date.now() - started),
				evidence: normalizeEvidence(content),
				errorClass: ok ? undefined : "execution_assertion_failed",
			};
		}
		if (plan.type === "list_files") {
			const entries = await readdir(join(cwd, plan.target));
			const combined = entries.join("\n");
			const ok = plan.expectContains ? entries.includes(plan.expectContains) : entries.length > 0;
			return {
				ok,
				latencyMs: Math.max(1, Date.now() - started),
				evidence: normalizeEvidence(combined),
				errorClass: ok ? undefined : "execution_assertion_failed",
			};
		}
		if (plan.type === "search") {
			const content = await readFile(join(cwd, plan.target), "utf-8");
			const ok = content.includes(plan.query);
			return {
				ok,
				latencyMs: Math.max(1, Date.now() - started),
				evidence: normalizeEvidence(content),
				errorClass: ok ? undefined : "execution_assertion_failed",
			};
		}
		const [command] = plan.command;
		if (!command || !ALLOWED_COMMANDS.has(command)) {
			return {
				ok: false,
				latencyMs: Math.max(1, Date.now() - started),
				errorClass: "command_not_allowed",
			};
		}
		const { stdout, stderr } = await executeCommand(plan.command, cwd, timeoutMs);
		const output = `${stdout}\n${stderr}`.trim();
		const ok = plan.expectContains ? output.includes(plan.expectContains) : output.length >= 0;
		return {
			ok,
			latencyMs: Math.max(1, Date.now() - started),
			evidence: normalizeEvidence(output),
			errorClass: ok ? undefined : "execution_assertion_failed",
		};
	} catch (error) {
		return {
			ok: false,
			latencyMs: Math.max(1, Date.now() - started),
			errorClass: error instanceof Error ? "execution_failed" : "execution_unknown_error",
			evidence: error instanceof Error ? normalizeEvidence(error.message) : undefined,
		};
	}
}
