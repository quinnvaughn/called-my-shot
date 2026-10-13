import { db } from "../../db"
import {
	enqueueAnalyticsEvents,
	type ServerAnalyticsEvent,
} from "../analytics-outbox"
import { ValidationError } from "../errors"
import { categoryMessage, moderateText } from "./index"
import type { ModerationCategory, Strictness } from "./types"

// The moderation check on something a person wrote, with whatever it turns
// away recorded (without the text) so a filter that's too eager shows up in
// the numbers. `blocked` names the event for the surface it came from.
export async function assertAllowedText(
	text: string,
	field: string,
	strictness: Strictness,
	blocked: (category: ModerationCategory) => ServerAnalyticsEvent,
): Promise<void> {
	const result = await moderateText(text, { strictness })
	if (result.ok) return
	await db.transaction((tx) =>
		enqueueAnalyticsEvents(tx, [blocked(result.category)]),
	)
	throw ValidationError.field(field, categoryMessage(result.category))
}
