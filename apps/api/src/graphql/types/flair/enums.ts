import { flairSource, flairUnlock } from "../../../db/schema"
import { builder } from "../../builder"

// Built from the pgEnum's own values rather than hand-listed, for the same
// reason as EmailPreferenceType in ../user/enums.ts: a source added to the
// table can't be missing from the api without anyone noticing.
export const FlairSourceEnum = builder.enumType("FlairSource", {
	values: Object.fromEntries(
		flairSource.enumValues.map((value) => [value.toUpperCase(), { value }]),
	) as Record<string, { value: (typeof flairSource.enumValues)[number] }>,
})

export const FlairUnlockEnum = builder.enumType("FlairUnlock", {
	values: Object.fromEntries(
		flairUnlock.enumValues.map((value) => [value.toUpperCase(), { value }]),
	) as Record<string, { value: (typeof flairUnlock.enumValues)[number] }>,
})
