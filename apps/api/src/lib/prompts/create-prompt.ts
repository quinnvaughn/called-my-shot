import {
	type CreatePromptInput,
	createPromptSchema,
	defaultPromptColor,
	PROMPT_TITLE_MIN,
	rushmorePositionsFor,
} from "@called-my-shot/schemas"
import { db } from "../../db"
import { type Prompt, prompts, type User } from "../../db/schema"
import { NotFoundError, ValidationError } from "../errors"
import { isUniqueViolation } from "../invite-codes"
import { assertAllowedPostText } from "../posts/moderation"
import { promptSlug } from "./slug"
import { promptSubject } from "./subject"

// Someone starting a question for everyone to answer: "Rushmore of NBA point
// guards", "Boston sports Rushmore". A league narrows who can be picked to
// its players, a team to one franchise's, and neither leaves it open to every
// sport. A team brings its own league; one named alongside it has to match.
// Positions are the league's codes and need one; a played-between range of
// years works with or without.
//
// Its title goes through the strict check rather than the standard one: it's
// printed above every answer, on every share image and at its link, under
// other people's names.
//
// The title is stored as just what it's of, without the word Rushmore (see
// ./subject.ts).
//
// The code is its address on share images, /rushmore/{code}, read off the
// title (see ./slug.ts). A second prompt with the same title gets -2, -3 and
// so on.
export async function createPrompt(
	creator: User,
	input: CreatePromptInput,
): Promise<Prompt> {
	const result = createPromptSchema.safeParse(input)
	if (!result.success) throw ValidationError.fromZodIssues(result.error.issues)
	const parsed = result.data

	let leagueId = parsed.leagueId ?? null
	if (leagueId) {
		const league = await db.query.leagues.findFirst({
			where: { id: leagueId },
			columns: { id: true },
		})
		if (!league) throw new NotFoundError("League not found")
	}
	if (parsed.teamId) {
		const team = await db.query.teams.findFirst({
			where: { id: parsed.teamId },
			columns: { leagueId: true },
		})
		if (!team) throw new NotFoundError("Team not found")
		if (leagueId && team.leagueId !== leagueId) {
			throw ValidationError.field("teamId", "That team isn't in this league.")
		}
		leagueId = team.leagueId
	}
	const positions = [...new Set(parsed.positions)]
	if (positions.length > 0) {
		const league = leagueId
			? await db.query.leagues.findFirst({
					where: { id: leagueId },
					columns: { abbreviation: true },
				})
			: undefined
		if (!league) {
			throw ValidationError.field(
				"positions",
				"Pick a league to narrow it to positions.",
			)
		}
		const known = new Set(
			rushmorePositionsFor(league.abbreviation).map((p) => p.code),
		)
		if (positions.some((position) => !known.has(position))) {
			throw ValidationError.field(
				"positions",
				`Those aren't all ${league.abbreviation} positions.`,
			)
		}
	}

	const title = promptSubject(parsed.title)
	if (title.length < PROMPT_TITLE_MIN) {
		throw ValidationError.field(
			"title",
			"Say what it's a Mount Rushmore of, like NBA point guards.",
		)
	}
	await assertAllowedPostText(
		creator.id,
		[{ field: "title", text: title }],
		"strict",
	)

	const base = promptSlug(title)
	for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n++) {
		try {
			const [row] = await db
				.insert(prompts)
				.values({
					kind: "rushmore",
					code: n === 1 ? base : `${base}-${n}`,
					creatorId: creator.id,
					title,
					leagueId,
					teamId: parsed.teamId ?? null,
					positions,
					// A team's prompt takes the team's color.
					color: parsed.teamId
						? null
						: (parsed.color ?? defaultPromptColor(title)),
					fromYear: parsed.fromYear ?? null,
					toYear: parsed.toYear ?? null,
				})
				.returning()
			if (!row) throw new Error("Prompt insert returned nothing")
			return row
		} catch (err) {
			if (!isUniqueViolation(err)) throw err
		}
	}
	throw ValidationError.field(
		"title",
		"There are already plenty of prompts with that title. Answer one of them instead.",
	)
}

const MAX_SLUG_ATTEMPTS = 50
