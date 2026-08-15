import { z } from "zod"

// Lowercase to match the values the GraphQL layer resolves these enums to
// server-side (see builder.enumType in apps/api/src/graphql/types/question.ts
// - e.g. MULTIPLE_CHOICE resolves to "multiple_choice"), not the SCREAMING_
// SNAKE_CASE names used on the wire. The frontend form works in this same
// lowercase form and only upper-cases at the GraphQL call boundary.
export const questionTypeSchema = z.enum([
	"multiple_choice",
	"yes_no",
	"over_under",
	"numeric_guess",
	"multi_select",
])

export const questionCategorySchema = z.enum([
	"season_awards",
	"game_stats",
	"player_stats",
	"other",
])

export const numericSubjectTypeSchema = z.enum(["player", "team"])

const createQuestionOptionSchema = z.object({
	label: z.string().trim().min(1, "Option can't be empty"),
	teamId: z.string().uuid().optional(),
	playerId: z.string().uuid().optional(),
})

// One flat object rather than a discriminated union on `type` - a single
// stable shape is what the create-question form's field bindings need, and
// the per-type requirements below are cross-field concerns anyway (an
// over/under's line only makes sense once you already know it's an
// over/under), which is exactly what superRefine is for.
//
// locksAt stays a plain string (not z.coerce.date()) so it binds directly to
// a native <input type="datetime-local"> value without a Date round-trip in
// the form layer - it's parsed to a Date only where that's actually needed
// (the refine below, and the API resolver's insert).
export const createQuestionSchema = z
	.object({
		type: questionTypeSchema,
		// Plain string, not questionCategorySchema directly - same "empty until
		// explicitly chosen" shape as sportId/leagueId below, rather than a
		// silent default category nobody actually picked.
		category: z
			.string()
			.refine(
				(value) =>
					(questionCategorySchema.options as readonly string[]).includes(
						value,
					),
				"Pick a category",
			),
		title: z
			.string()
			.trim()
			.min(5, "Question text must be at least 5 characters")
			.max(140, "Question text must be 140 characters or fewer"),
		sportId: z.string().uuid("Pick a sport"),
		leagueId: z.string().uuid("Pick a league"),

		resolutionSource: z.string().trim().min(1, "Say where you'll check this"),
		resolutionSourceUrl: z
			.string()
			.trim()
			.default("")
			.refine(
				(value) => value === "" || z.string().url().safeParse(value).success,
				"Enter a valid URL",
			),
		locksAt: z
			.string()
			.min(1, "Pick a lock time")
			.refine(
				(value) => !Number.isNaN(new Date(value).getTime()),
				"Pick a valid lock time",
			)
			.refine(
				(value) => new Date(value).getTime() > Date.now(),
				"Lock time must be in the future",
			),
		isOfficial: z.boolean().optional(),

		// multiple_choice options / multi_select pool
		options: z.array(createQuestionOptionSchema).default([]),

		// over_under, numeric_guess
		statId: z.string().uuid().optional(),
		customStat: z.string().trim().default(""),

		// over_under
		ouLine: z.number().optional(),

		// yes_no, over_under, numeric_guess - optional subject
		numericSubjectType: numericSubjectTypeSchema.optional(),
		subjectTeamId: z.string().uuid().optional(),
		subjectPlayerId: z.string().uuid().optional(),

		// numeric_guess - fraction of the actual value, e.g. 0.1 = within 10%
		numericTolerancePct: z.number().optional(),

		// multi_select
		picksRequired: z.number().int().optional(),
	})
	.superRefine((data, ctx) => {
		switch (data.type) {
			case "multiple_choice": {
				const options = data.options ?? []
				if (options.length < 2 || options.length > 30) {
					ctx.addIssue({
						code: "custom",
						path: ["options"],
						message: "Add between 2 and 30 options",
					})
				}
				break
			}
			case "yes_no": {
				// Fixed Yes/No pair - server-generated, nothing to validate here.
				break
			}
			case "over_under": {
				if (data.ouLine === undefined) {
					ctx.addIssue({
						code: "custom",
						path: ["ouLine"],
						message: "Set the line",
					})
				} else if (Number.isInteger(data.ouLine)) {
					// A whole-number line the actual result can land on exactly isn't
					// an over/under anymore - there's no push/void outcome anywhere in
					// this app (resolution just marks one option isCorrect), so a tie
					// has no defined result.
					ctx.addIssue({
						code: "custom",
						path: ["ouLine"],
						message: "Can't be a whole number - the result could land exactly on it",
					})
				}
				if (!data.statId && !data.customStat.trim()) {
					ctx.addIssue({
						code: "custom",
						path: ["customStat"],
						message: "Pick a stat",
					})
				}
				break
			}
			case "numeric_guess": {
				if (!data.statId && !data.customStat.trim()) {
					ctx.addIssue({
						code: "custom",
						path: ["customStat"],
						message: "Pick a stat",
					})
				}
				if (!data.numericSubjectType) {
					ctx.addIssue({
						code: "custom",
						path: ["numericSubjectType"],
						message: "Pick who this is about",
					})
				} else if (
					data.numericSubjectType === "player" &&
					!data.subjectPlayerId
				) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectPlayerId"],
						message: "Pick a player",
					})
				} else if (data.numericSubjectType === "team" && !data.subjectTeamId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectTeamId"],
						message: "Pick a team",
					})
				}
				if (
					data.numericTolerancePct === undefined ||
					data.numericTolerancePct <= 0 ||
					data.numericTolerancePct > 1
				) {
					ctx.addIssue({
						code: "custom",
						path: ["numericTolerancePct"],
						message: "Tolerance must be between 0 and 100%",
					})
				}
				break
			}
			case "multi_select": {
				const picks = data.picksRequired
				const poolSize = (data.options ?? []).length
				if (picks === undefined || picks < 2) {
					ctx.addIssue({
						code: "custom",
						path: ["picksRequired"],
						message: "Picks required must be at least 2",
					})
				} else if (poolSize <= picks) {
					ctx.addIssue({
						code: "custom",
						path: ["options"],
						message: "Pool must be larger than picks required",
					})
				}
				break
			}
		}

		// season_awards/game_stats/player_stats restrict options to real teams
		// or players (see EntitySearchField in the create-question form) - "other"
		// is the only category with no fixed vocabulary. Enforced here too, not
		// just as a client-side hint, since the option rows are still plain text
		// inputs that a client could submit unmatched.
		if (
			(data.type === "multiple_choice" || data.type === "multi_select") &&
			data.category !== "other" &&
			data.category !== ""
		) {
			data.options.forEach((option, index) => {
				if (!option.teamId && !option.playerId) {
					ctx.addIssue({
						code: "custom",
						path: ["options", index, "label"],
						message: "Pick a real team or player from the list",
					})
				}
			})
		}
	})
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>
