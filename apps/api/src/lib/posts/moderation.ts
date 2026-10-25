import type { Strictness } from "../moderation"
import { assertAllowedText } from "../moderation/guard"

// The text check on what someone wrote on a post: its body and each pick's
// reason at "standard", the same bar as a comment, since a post is read by
// whoever it's in front of. A prompt's title is held to "strict" (see
// lib/prompts/create-prompt.ts): it's printed on every answer, every share
// image and the page at its link, under other people's names.
//
// Run before any transaction: each check can be a network round trip, and a
// refusal shouldn't hold a lock.
export async function assertAllowedPostText(
	authorId: string,
	fields: { field: string; text: string }[],
	strictness: Strictness = "standard",
): Promise<void> {
	for (const { field, text } of fields) {
		if (text.length === 0) continue
		await assertAllowedText(text, field, strictness, (category) => ({
			event: "post_text_blocked",
			userId: authorId,
			properties: {
				field: fieldKind(field),
				category,
				strictness,
			},
		}))
	}
}

// A pick's reason arrives as "picks.2.reason".
function fieldKind(field: string): "body" | "reason" | "title" {
	if (field === "title") return "title"
	if (field === "body") return "body"
	return "reason"
}
