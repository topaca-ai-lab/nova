export type WorkingMemoryItem = {
	id: string;
	text: string;
	confidence: number;
	turn: number;
};

export type WorkingMemorySnapshot = {
	items: WorkingMemoryItem[];
	confidence: number;
};

export class WorkingMemory {
	private items: WorkingMemoryItem[] = [];
	private maxItems: number;

	constructor(maxItems = 8) {
		this.maxItems = Math.max(1, maxItems);
	}

	public remember(text: string, confidence: number, turn: number): void {
		const normalized = text.trim();
		if (!normalized) {
			return;
		}
		const item: WorkingMemoryItem = {
			id: `wm-${turn}-${this.items.length + 1}`,
			text: normalized,
			confidence: Math.min(1, Math.max(0, confidence)),
			turn,
		};
		this.items = [item, ...this.items].slice(0, this.maxItems);
	}

	public snapshot(): WorkingMemorySnapshot {
		const confidence =
			this.items.length === 0 ? 1 : this.items.reduce((sum, item) => sum + item.confidence, 0) / this.items.length;
		return {
			items: [...this.items],
			confidence,
		};
	}
}
