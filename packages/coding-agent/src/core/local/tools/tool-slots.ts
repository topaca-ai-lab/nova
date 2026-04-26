import type { SlotInvocation, SlotSelection, VisibleToolSlot } from "@topaca/nova-agent-core";

export type CodingAgentInternalTool = "read" | "ls" | "find" | "grep" | "write" | "edit" | "bash" | "finish";

const ROUTABLE_TOOL_NAMES = new Set<string>(["read", "ls", "find", "grep", "write", "edit", "bash"]);

export function isRoutableCodingAgentToolName(toolName: string): boolean {
	return ROUTABLE_TOOL_NAMES.has(toolName);
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object") {
		return value as Record<string, unknown>;
	}
	return {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export const LOCAL_VISIBLE_TOOL_SLOTS: VisibleToolSlot[] = ["inspect", "modify", "execute", "meta"];

export function mapSlotInvocationToCodingAgentTool(invocation: SlotInvocation): CodingAgentInternalTool {
	if (invocation.slot === "inspect") {
		if (invocation.action === "read") {
			return "read";
		}
		if (invocation.action === "list_files") {
			return "ls";
		}
		return "grep";
	}

	if (invocation.slot === "modify") {
		if (invocation.action === "replace_range") {
			return "edit";
		}
		return "write";
	}

	if (invocation.slot === "execute") {
		if (invocation.action === "run_command") {
			return "bash";
		}
		return "finish";
	}

	return "finish";
}

export function inferSlotSelectionFromCodingAgentTool(toolName: string, _rawArgs: unknown): SlotSelection | undefined {
	if (toolName === "read" || toolName === "ls" || toolName === "find" || toolName === "grep") {
		return { slot: "inspect" };
	}
	if (toolName === "write" || toolName === "edit") {
		return { slot: "modify" };
	}
	if (toolName === "bash") {
		return { slot: "execute" };
	}
	return undefined;
}

export function inferSlotInvocationFromCodingAgentTool(
	toolName: string,
	selection: SlotSelection,
	rawArgs: unknown,
): SlotInvocation | undefined {
	const args = asRecord(rawArgs);

	if (selection.slot === "inspect" && toolName === "read") {
		const target = getString(args, "path") ?? getString(args, "file_path");
		return { slot: "inspect", action: "read", target };
	}
	if (selection.slot === "inspect" && (toolName === "ls" || toolName === "find")) {
		const target = getString(args, "path");
		return { slot: "inspect", action: "list_files", target };
	}
	if (selection.slot === "inspect" && toolName === "grep") {
		const target = getString(args, "path");
		const query = getString(args, "pattern");
		return { slot: "inspect", action: "search", target, query };
	}
	if (selection.slot === "modify" && toolName === "write") {
		const path = getString(args, "path");
		if (!path) {
			return undefined;
		}
		const content = getString(args, "content");
		return { slot: "modify", action: "write_file", path, content };
	}
	if (selection.slot === "modify" && toolName === "edit") {
		const path = getString(args, "path");
		if (!path) {
			return undefined;
		}
		return { slot: "modify", action: "write_file", path };
	}
	if (selection.slot === "execute" && toolName === "bash") {
		const command = getString(args, "command");
		if (!command) {
			return undefined;
		}
		return { slot: "execute", action: "run_command", command };
	}
	return undefined;
}
