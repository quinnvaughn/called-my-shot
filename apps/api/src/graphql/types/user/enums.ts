import { emailPreferenceType, streakFamily } from "../../../db/schema"
import { builder } from "../../builder"

export const StreakFamilyEnum = builder.enumType("StreakFamily", {
	values: Object.fromEntries(
		streakFamily.enumValues.map((value) => [value.toUpperCase(), { value }]),
	) as Record<string, { value: (typeof streakFamily.enumValues)[number] }>,
})

// Built from the pgEnum's own values rather than hand-listed, so a type added
// to the table can't be missing from the api without anyone noticing. The
// SCREAMING_SNAKE names are the GraphQL convention the rest of this schema
// already uses; the values stay the table's snake_case.
export const EmailPreferenceType = builder.enumType("EmailPreferenceType", {
	values: Object.fromEntries(
		emailPreferenceType.enumValues.map((value) => [
			value.toUpperCase(),
			{ value },
		]),
	) as Record<
		string,
		{ value: (typeof emailPreferenceType.enumValues)[number] }
	>,
})

export const AdminUserSort = builder.enumType("AdminUserSort", {
	values: {
		USERNAME: { value: "username" },
		STRIKES: { value: "strikeCount" },
		VERIFIED: { value: "isVerifiedPundit" },
		CREATION_ENABLED: { value: "questionCreationEnabled" },
	},
})
