import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { BenchmarkReport } from "./benchmark-types.js";

const LOCAL_BENCHMARKS_DIR = ".nova/local-benchmarks";

function sanitize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function nowStamp(date: Date = new Date()): string {
	const iso = date.toISOString().replace(/[:]/g, "").replace(/\..+$/, "Z");
	return iso;
}

function resolveBenchDir(cwd: string): string {
	return resolve(cwd, LOCAL_BENCHMARKS_DIR);
}

export type StoredBenchmarkArtifact = {
	id: string;
	path: string;
	report: BenchmarkReport;
};

export function saveBenchmarkReportArtifact(
	report: BenchmarkReport,
	options: { cwd?: string; mode: "simulate" | "live"; tag?: string },
): StoredBenchmarkArtifact {
	const cwd = options.cwd ?? process.cwd();
	const dir = resolveBenchDir(cwd);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const stamp = nowStamp();
	const backend = sanitize(report.backendHint || "backend");
	const model = sanitize(report.model || "model");
	const tag = options.tag ? `-${sanitize(options.tag)}` : "";
	const id = `${stamp}-${backend}-${model}-${options.mode}${tag}`;
	const path = join(dir, `${id}.json`);
	writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
	return { id, path, report };
}

export function writeBenchmarkReportToPath(report: BenchmarkReport, path: string, cwd: string = process.cwd()): string {
	const resolved = resolve(cwd, path);
	const parent = dirname(resolved);
	if (!existsSync(parent)) {
		mkdirSync(parent, { recursive: true });
	}
	writeFileSync(resolved, JSON.stringify(report, null, 2), "utf-8");
	return resolved;
}

function parseArtifactPath(path: string): StoredBenchmarkArtifact | undefined {
	try {
		const raw = readFileSync(path, "utf-8");
		const report = JSON.parse(raw) as BenchmarkReport;
		const id = basename(path).replace(/\.json$/i, "");
		return { id, path, report };
	} catch {
		return undefined;
	}
}

export function listBenchmarkReportArtifacts(cwd: string = process.cwd()): StoredBenchmarkArtifact[] {
	const dir = resolveBenchDir(cwd);
	if (!existsSync(dir)) {
		return [];
	}
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.reverse();
	const artifacts: StoredBenchmarkArtifact[] = [];
	for (const file of files) {
		const parsed = parseArtifactPath(join(dir, file));
		if (parsed) {
			artifacts.push(parsed);
		}
	}
	return artifacts;
}

export function resolveBenchmarkArtifactRef(
	ref: string,
	cwd: string = process.cwd(),
): StoredBenchmarkArtifact | undefined {
	if (isAbsolute(ref) || ref.includes("/")) {
		return parseArtifactPath(resolve(cwd, ref));
	}
	const artifacts = listBenchmarkReportArtifacts(cwd);
	return artifacts.find((artifact) => artifact.id === ref || artifact.id.startsWith(ref));
}

export function latestBenchmarkSummaryMatrix(cwd: string = process.cwd()): Array<{
	key: string;
	backendHint: string;
	model: string;
	passRate: number;
	executionValidationRate: number;
	averageRepairCount: number;
	artifactId: string;
}> {
	const artifacts = listBenchmarkReportArtifacts(cwd);
	const latestByKey = new Map<string, StoredBenchmarkArtifact>();
	for (const artifact of artifacts) {
		const key = `${artifact.report.backendHint}::${artifact.report.model}`;
		if (!latestByKey.has(key)) {
			latestByKey.set(key, artifact);
		}
	}
	return Array.from(latestByKey.entries()).map(([key, artifact]) => ({
		key,
		backendHint: artifact.report.backendHint,
		model: artifact.report.model,
		passRate: artifact.report.passRate,
		executionValidationRate: artifact.report.executionValidationRate,
		averageRepairCount: artifact.report.averageRepairCount,
		artifactId: artifact.id,
	}));
}
