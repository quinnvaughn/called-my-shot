export type Strictness = "standard" | "strict"

export type ModerationCategory =
	| "hate"
	| "threat"
	| "sexual"
	| "personal_info"
	| "harassment"

export type ModerationResult =
	| { ok: true }
	| { ok: false; category: ModerationCategory }

// A second opinion after the local check, for what a word list can't catch.
// None is set by default.
export type ModerationProvider = {
	check(text: string, strictness: Strictness): Promise<ModerationResult>
}
