import { match } from "ts-pattern"
import { ValidationError } from "../errors"
import { checkLocally } from "./local"
import type {
	ModerationCategory,
	ModerationProvider,
	ModerationResult,
	Strictness,
} from "./types"

export type { ModerationCategory, ModerationResult, Strictness } from "./types"

let provider: ModerationProvider | null = null

// Swaps in a provider behind the local check, or removes it with null. Tests
// use it to stand one in.
export function setModerationProvider(next: ModerationProvider | null): void {
	provider = next
}

export async function moderateText(
	text: string,
	{ strictness }: { strictness: Strictness },
): Promise<ModerationResult> {
	const local = checkLocally(text, strictness)
	if (!local.ok || !provider) return local
	return provider.check(text, strictness)
}

export function categoryMessage(category: ModerationCategory): string {
	return match(category)
		.with("hate", () => "Slurs aren't allowed here.")
		.with("threat", () => "Threats aren't allowed here.")
		.with(
			"sexual",
			() => "Sexual content about a real person isn't allowed here.",
		)
		.with(
			"personal_info",
			() => "Don't post anyone's contact details or address.",
		)
		.with(
			"harassment",
			() => "That reads as harassment. Keep it about the calls.",
		)
		.exhaustive()
}

// Throws a ValidationError on `field` when the text is blocked.
export async function assertAllowed(
	text: string,
	field: string,
	strictness: Strictness,
): Promise<void> {
	const result = await moderateText(text, { strictness })
	if (!result.ok) {
		throw ValidationError.field(field, categoryMessage(result.category))
	}
}
