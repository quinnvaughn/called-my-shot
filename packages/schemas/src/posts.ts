import { z } from "zod"
import { PRESSER_REPORT_DETAILS_MAX, PRESSER_REPORT_REASONS } from "./pressers"
import { PROMPT_COLOR_HEXES } from "./prompt-colors"
import { RUSHMORE_YEAR_MAX, RUSHMORE_YEAR_MIN } from "./rushmore-positions"

// Posts are what people make for everyone (or one group) to see, answering a
// prompt: a Mount Rushmore of four players, and a few words if they want. The api enforces these limits and the
// composer counts down against the same numbers.

export const RUSHMORE_PICK_COUNT = 4
export const POST_BODY_MAX = 1000
export const PROMPT_TITLE_MIN = 4
export const PROMPT_TITLE_MAX = 60

const body = z
	.string()
	.trim()
	.max(POST_BODY_MAX, `Keep it under ${POST_BODY_MAX} characters`)
	.default("")

// The picks in the order the author arranged them, left to right. That order
// is all a position means: a Rushmore has no #1.
export const createRushmoreSchema = z.object({
	promptId: z.string().uuid(),
	groupId: z.string().uuid().nullish(),
	body,
	playerIds: z
		.array(z.string().uuid())
		.length(RUSHMORE_PICK_COUNT, `Pick exactly ${RUSHMORE_PICK_COUNT} players`)
		.refine(
			(ids) => new Set(ids).size === ids.length,
			"Pick four different players",
		),
})
export type CreateRushmoreInput = z.input<typeof createRushmoreSchema>

// Only the words change after posting.
export const updateRushmoreSchema = z.object({
	postId: z.string().uuid(),
	body,
})
export type UpdateRushmoreInput = z.input<typeof updateRushmoreSchema>

const promptYear = z
	.number()
	.int("Use a whole year")
	.min(RUSHMORE_YEAR_MIN, `Use a year from ${RUSHMORE_YEAR_MIN} on`)
	.max(RUSHMORE_YEAR_MAX, "Use a real year")
	.nullish()

// Who a prompt's picks can come from: a league and team narrow it, positions
// (codes from RUSHMORE_POSITIONS, needing a league) and a played-between
// range of calendar years narrow it further.
export const createPromptSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(PROMPT_TITLE_MIN, `Give it at least ${PROMPT_TITLE_MIN} characters`)
			.max(PROMPT_TITLE_MAX, `Keep it under ${PROMPT_TITLE_MAX} characters`),
		leagueId: z.string().uuid().nullish(),
		teamId: z.string().uuid().nullish(),
		positions: z.array(z.string()).max(10).default([]),
		// One of PROMPT_COLORS; left out, the title picks one. Ignored with a
		// team, whose own color it takes.
		color: z.enum(PROMPT_COLOR_HEXES).nullish(),
		fromYear: promptYear,
		toYear: promptYear,
	})
	.refine(
		(input) =>
			!input.fromYear || !input.toYear || input.fromYear <= input.toYear,
		{ path: ["toYear"], message: "The end year comes after the start year" },
	)
export type CreatePromptInput = z.input<typeof createPromptSchema>

export const reportPostSchema = z.object({
	postId: z.string().uuid(),
	reason: z.enum(PRESSER_REPORT_REASONS),
	details: z
		.string()
		.trim()
		.max(
			PRESSER_REPORT_DETAILS_MAX,
			`Keep it under ${PRESSER_REPORT_DETAILS_MAX} characters`,
		)
		.default(""),
})
export type ReportPostInput = z.input<typeof reportPostSchema>
