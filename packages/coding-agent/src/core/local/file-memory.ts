export type FileMemorySegment = {
	path: string;
	snippet: string;
	turn: number;
};

export class FileMemory {
	private segments: FileMemorySegment[] = [];
	private maxSegments: number;

	constructor(maxSegments = 3) {
		this.maxSegments = Math.max(1, maxSegments);
	}

	public ingestFromTool(toolName: string, args: unknown, resultText: string, turn: number): void {
		const path = this.extractPath(toolName, args);
		if (!path) {
			return;
		}
		const snippet = resultText.trim().slice(0, 400);
		if (!snippet) {
			return;
		}
		const segment: FileMemorySegment = { path, snippet, turn };
		this.segments = [segment, ...this.segments.filter((existing) => existing.path !== path)].slice(
			0,
			this.maxSegments,
		);
	}

	public getActiveSegments(): FileMemorySegment[] {
		return [...this.segments];
	}

	private extractPath(toolName: string, args: unknown): string | undefined {
		if (!args || typeof args !== "object") {
			return undefined;
		}
		const record = args as Record<string, unknown>;
		if (toolName === "read" || toolName === "write" || toolName === "edit") {
			const path = record.path ?? record.file_path;
			return typeof path === "string" && path.trim().length > 0 ? path : undefined;
		}
		if (toolName === "grep" || toolName === "find" || toolName === "ls") {
			const path = record.path;
			return typeof path === "string" && path.trim().length > 0 ? path : undefined;
		}
		return undefined;
	}
}
