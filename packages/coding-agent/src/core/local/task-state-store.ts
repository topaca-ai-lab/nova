import type { VisibleToolSlot } from "@topaca/nova-agent-core";

export type TaskStateSnapshot = {
	summary: string;
	nextStep: string;
	ageInTurns: number;
	lastSlot?: VisibleToolSlot;
	lastUpdatedTurn: number;
};

export class TaskStateStore {
	private summary = "";
	private nextStep = "";
	private ageInTurns = 0;
	private lastSlot: VisibleToolSlot | undefined = undefined;
	private lastUpdatedTurn = 0;

	public onTurn(slot: VisibleToolSlot | undefined, turnIndex: number): void {
		this.ageInTurns += 1;
		if (slot) {
			this.lastSlot = slot;
		}
		this.lastUpdatedTurn = turnIndex;
	}

	public update(summary: string | undefined, nextStep: string | undefined, turnIndex: number): void {
		if (summary && summary.trim().length > 0) {
			this.summary = summary.trim();
		}
		if (nextStep && nextStep.trim().length > 0) {
			this.nextStep = nextStep.trim();
		}
		this.ageInTurns = 0;
		this.lastUpdatedTurn = turnIndex;
	}

	public snapshot(): TaskStateSnapshot {
		return {
			summary: this.summary,
			nextStep: this.nextStep,
			ageInTurns: this.ageInTurns,
			lastSlot: this.lastSlot,
			lastUpdatedTurn: this.lastUpdatedTurn,
		};
	}
}
