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

		// multi_select
		picksRequired: z.number().int().optional(),

		// multiple_choice only - see optionsOpenField on the questions table for
		// what this actually changes at runtime. openFieldKind says what kind of
		// entity fills the pool (castCall needs to know whether a caller's pick
		// has to resolve to a real team or a real player).
		optionsOpenField: z.boolean().optional(),
		openFieldKind: numericSubjectTypeSchema.optional(),
	})
	.superRefine((data, ctx) => {
		switch (data.type) {
			case "multiple_choice": {
				const options = data.options ?? []
				if (data.optionsOpenField) {
					if (!data.openFieldKind) {
						ctx.addIssue({
							code: "custom",
							path: ["openFieldKind"],
							message: "Pick what the field is made of",
						})
					}
					if (options.length > 30) {
						ctx.addIssue({
							code: "custom",
							path: ["options"],
							message: "Start with at most 30 options",
						})
					}
				} else if (options.length < 2 || options.length > 30) {
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
				// Catalog stat required, no customStat fallback - the tolerance
				// band comes from the stat's tolerance tier (see createQuestion's
				// resolver), and a freeform stat has no tier to look one up from.
				if (!data.statId) {
					ctx.addIssue({
						code: "custom",
						path: ["statId"],
						message: "Pick a stat from the list",
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

// One call selection - an option the caller picked plus how much conviction
// they put behind that specific pick. multi_select is the only type that
// submits more than one of these; every other option-based type submits
// exactly one (enforced below, since the count that's valid depends on
// question type, which this schema doesn't know on its own).
const castCallSelectionSchema = z.object({
	optionId: z.string().uuid(),
	conviction: z.number().int().min(1, "Conviction must be 1-100").max(100, "Conviction must be 1-100"),
})

// multiple_choice on an optionsOpenField question only - a pick that isn't
// among the question's existing questionOptions yet. The resolver finds or
// creates the matching option from teamId/playerId (whichever the question's
// openFieldKind calls for) rather than trusting label alone, same "must
// resolve to a real entity" rule the creator-listed pool already enforces.
const castCallNewOptionSchema = z.object({
	label: z.string().trim().min(1),
	teamId: z.string().uuid().optional(),
	playerId: z.string().uuid().optional(),
	conviction: z.number().int().min(1, "Conviction must be 1-100").max(100, "Conviction must be 1-100"),
})

// Same flat-object-plus-superRefine shape as createQuestionSchema. `type` is
// supplied by the resolver from the question it already had to load (for the
// lock/status checks), not taken from client input - a client claiming a
// different type than the question actually is would otherwise let it dodge
// these per-type rules entirely.
export const castCallSchema = z
	.object({
		type: questionTypeSchema,
		questionId: z.string().uuid(),
		caseText: z.string().trim().max(600, "Keep it under 600 characters").default(""),

		// numeric_guess only
		guessValue: z.number().optional(),
		conviction: z
			.number()
			.int()
			.min(1, "Conviction must be 1-100")
			.max(100, "Conviction must be 1-100")
			.optional(),

		// multiple_choice / yes_no / over_under (exactly 1, or - multiple_choice
		// on an optionsOpenField question only - newOption instead) / multi_select
		// (>=1, exact count checked against the question's picksRequired in the
		// resolver, which is the only place that number is known)
		selections: z.array(castCallSelectionSchema).default([]),
		newOption: castCallNewOptionSchema.optional(),
	})
	.superRefine((data, ctx) => {
		switch (data.type) {
			case "numeric_guess": {
				if (data.guessValue === undefined || Number.isNaN(data.guessValue)) {
					ctx.addIssue({
						code: "custom",
						path: ["guessValue"],
						message: "Enter your guess",
					})
				}
				if (data.conviction === undefined) {
					ctx.addIssue({
						code: "custom",
						path: ["conviction"],
						message: "Set your conviction",
					})
				}
				break
			}
			case "yes_no":
			case "over_under": {
				if (data.selections.length !== 1) {
					ctx.addIssue({
						code: "custom",
						path: ["selections"],
						message: "Pick one",
					})
				}
				if (data.newOption) {
					ctx.addIssue({
						code: "custom",
						path: ["newOption"],
						message: "This question's options are fixed.",
					})
				}
				break
			}
			case "multiple_choice": {
				const pickedExisting = data.selections.length === 1
				const pickedNew = data.newOption !== undefined
				if (pickedExisting === pickedNew) {
					ctx.addIssue({
						code: "custom",
						path: ["selections"],
						message: "Pick one",
					})
				}
				break
			}
			case "multi_select": {
				if (data.selections.length < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["selections"],
						message: "Pick at least one",
					})
				}
				break
			}
		}
	})
export type CastCallInput = z.infer<typeof castCallSchema>

// Same "type supplied by the resolver, not the client" reasoning as
// castCallSchema above - a question's own type isn't something a resolve
// call should be able to override either.
export const resolveQuestionSchema = z
	.object({
		type: questionTypeSchema,
		correctOptionIds: z.array(z.string().uuid()).default([]),
		actualValue: z.number().optional(),
		resolutionNote: z.string().trim().max(500, "Keep it under 500 characters").default(""),
	})
	.superRefine((data, ctx) => {
		switch (data.type) {
			case "multiple_choice":
			case "yes_no":
			case "over_under": {
				if (data.correctOptionIds.length !== 1) {
					ctx.addIssue({
						code: "custom",
						path: ["correctOptionIds"],
						message: "Pick exactly one correct option",
					})
				}
				break
			}
			case "multi_select": {
				// Deliberately not compared against picksRequired - a real outcome
				// can produce fewer genuine winners than the number of picks callers
				// were asked to make, and that's a valid result, not an error.
				if (data.correctOptionIds.length < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["correctOptionIds"],
						message: "Pick at least one correct option",
					})
				}
				break
			}
			case "numeric_guess": {
				if (data.actualValue === undefined || Number.isNaN(data.actualValue)) {
					ctx.addIssue({
						code: "custom",
						path: ["actualValue"],
						message: "Enter the actual value",
					})
				}
				break
			}
		}
	})
export type ResolveQuestionInput = z.infer<typeof resolveQuestionSchema>

export const fileDisputeSchema = z.object({
	questionId: z.string().uuid(),
	reason: z
		.string()
		.trim()
		.min(1, "Say why you're disputing this")
		.max(500, "Keep it under 500 characters"),
})
export type FileDisputeInput = z.infer<typeof fileDisputeSchema>
