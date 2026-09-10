import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import {
	and,
	asc,
	eq,
	gt,
	inArray,
	lte,
	notExists,
	type SQL,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../db"
import { calls, type Question, questions } from "../db/schema"

// The shapes that are an exactly-2-option pick. Derived from the scoring
// table rather than hand-listed so a new binary shape starts being offered as
// a first call the moment it's given the 150 rate, instead of silently
// missing from a second list nobody remembers to update.
const BINARY_SHAPES = Object.entries(BASE_POINTS_BY_SHAPE)
	.filter(([, points]) => points === 150)
	.map(([shape]) => shape as Question["shape"])

// Same 48-hour horizon the CLOSING_SOON feed sort uses (see
// graphql/types/question/queries.ts) - past that it stops reading as "soon",
// and a first call the user has to wait a week to see resolved doesn't teach
// them what a resolution feels like.
const SOON_HOURS = 48

// Written with the core query builder rather than db.query.questions, because
// the "hasn't already called this" condition is a correlated NOT EXISTS and
// the relational builder's where syntax only takes column filters.
function soonestOpen(userId: string, extra: SQL[]) {
	return db
		.select()
		.from(questions)
		.where(
			and(
				// `status` alone is not enough to tell whether a question is
				// still callable: nothing flips it off "open" the instant
				// locksAt passes (a cron sweeps every 15 minutes), so a
				// question can sit "open" for a while after its game has
				// already started. Re-derive from the clock, the same way the
				// feed's closing-soon filter does.
				eq(questions.status, "open"),
				gt(questions.locksAt, new Date()),
				// A question this user has already called is useless as a
				// suggestion: the checklist would point at something already
				// done, and castCall would reject it as a duplicate anyway.
				notExists(
					db
						.select()
						.from(calls)
						.where(
							and(eq(calls.questionId, questions.id), eq(calls.userId, userId)),
						),
				),
				...extra,
			),
		)
		.orderBy(asc(questions.locksAt))
		.limit(1)
}

// Picks the question to put in front of a user who has never made a call.
//
// This is where the "will there even be a game today?" problem gets absorbed:
// rather than the client guessing, the server walks a ladder from ideal to
// merely acceptable and the UI renders whatever comes back, labelled with its
// real lock time. Only a completely empty catalogue returns null.
//
// The ideal first call is a two-option game winner resolving tonight: nothing
// to learn about the format, and the result arrives while they still remember
// making it. Each rung below trades one of those properties away.
export async function suggestedFirstQuestion(
	userId: string,
): Promise<Question | null> {
	const soonCutoff = DateTime.now().plus({ hours: SOON_HOURS }).toJSDate()

	// 1. Official, binary, and locking within the horizon.
	const [ideal] = await soonestOpen(userId, [
		eq(questions.isOfficial, true),
		inArray(questions.shape, BINARY_SHAPES),
		lte(questions.locksAt, soonCutoff),
	])
	if (ideal) return ideal

	// 2. Any official question. In the offseason this is what's left: season
	// awards and win totals, which lock months out but are at least ours and
	// well-formed.
	const [official] = await soonestOpen(userId, [eq(questions.isOfficial, true)])
	if (official) return official

	// 3. Anything open at all, user-posted questions included.
	const [any] = await soonestOpen(userId, [])
	return any ?? null
}
