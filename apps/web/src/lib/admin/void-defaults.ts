import type { VoidReason } from "#/graphql/generated/graphql"

// Nonsensical/off-topic/unsupported-sport voids count against the asker's
// strikes by default; duplicate/other don't. Purely the toggle's starting
// state in the void modal - the server persists whatever it's actually sent,
// since whether a given void counts is a per-void call, never hardcoded to
// the reason.
export function defaultCountsAsStrike(reason: VoidReason): boolean {
	return reason !== "DUPLICATE" && reason !== "OTHER"
}

export const VOID_REASON_LABELS: Record<VoidReason, string> = {
	NONSENSICAL: "Nonsensical / malformed",
	OFF_TOPIC: "Not sports-related",
	UNSUPPORTED_SPORT: "Unsupported sport/league",
	DUPLICATE: "Duplicate",
	OTHER: "Other",
}
