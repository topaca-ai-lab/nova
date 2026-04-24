import { evaluateMetaPolicy, type MetaPolicyEvaluation, type MetaPolicyOptions } from "./meta-policy.js";
import type { LocalTurnSignals, VisibleToolSlot } from "./types.js";

export type SlotPolicyDecision = {
	allowedSlots: VisibleToolSlot[];
	forcedSlot?: VisibleToolSlot;
	preferredSlot?: VisibleToolSlot;
	meta: MetaPolicyEvaluation;
};

const DEFAULT_SLOT_ORDER: VisibleToolSlot[] = ["inspect", "modify", "execute", "meta"];

export function getSlotPolicyDecision(state: LocalTurnSignals, options: MetaPolicyOptions = {}): SlotPolicyDecision {
	const meta = evaluateMetaPolicy(state, options);
	if (meta.mustTrigger) {
		return {
			allowedSlots: ["meta"],
			forcedSlot: "meta",
			preferredSlot: "meta",
			meta,
		};
	}

	if (meta.isBlocked) {
		return {
			allowedSlots: DEFAULT_SLOT_ORDER.filter((slot) => slot !== "meta"),
			meta,
		};
	}

	if (meta.shouldTrigger) {
		return {
			allowedSlots: DEFAULT_SLOT_ORDER,
			preferredSlot: "meta",
			meta,
		};
	}

	return {
		allowedSlots: DEFAULT_SLOT_ORDER,
		meta,
	};
}
