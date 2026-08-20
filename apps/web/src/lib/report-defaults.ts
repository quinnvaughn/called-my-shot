import type { VoidReason } from "#/graphql/generated/graphql"

// Same 5 values as admin's void reasons (VOID_REASON_LABELS in
// lib/admin/void-defaults.ts) - reused rather than redeclared as a separate
// enum, just relabeled for a caller who doesn't know or care about admin's
// internal categories ("void" framing stays admin-only).
export const REPORT_REASON_LABELS: Record<VoidReason, string> = {
	NONSENSICAL: "Doesn't make sense / seems broken",
	OFF_TOPIC: "Not sports-related",
	UNSUPPORTED_SPORT: "Sport or league we don't support",
	DUPLICATE: "Duplicate of another question",
	OTHER: "Something else",
}
