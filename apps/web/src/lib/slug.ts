import { SPORTS_TIME_ZONE, slugify } from "@called-my-shot/schemas"
import { DateTime } from "luxon"

// buildQuestionSlug/questionPath moved to @called-my-shot/schemas so the api
// can build the same question urls for the resolution digest's links. They're
// re-exported here because every consumer in this app already imports them
// from "#/lib/slug", and the two should not disagree about where a question
// lives. buildGameSlug stays put - it needs luxon, which the schemas package
// doesn't depend on, and nothing server-side links to a game.
export { buildQuestionSlug, questionPath, slugify } from "@called-my-shot/schemas"

type GameSlugInput = {
	league: { slug: string }
	homeTeam: { name: string }
	awayTeam: { name: string }
	startsAt: string
}

// "nba-boston-celtics-at-los-angeles-lakers-2026-01-15". Away before home,
// matching the "@" convention the rest of the app reads off (see the comment
// on the games table).
//
// Full team names rather than abbreviations because the entire point of the
// slug is the words people type - "celtics lakers" finds this, "bos lal"
// doesn't. The date is in SPORTS_TIME_ZONE, not UTC: a 7pm ET game is already
// tomorrow in UTC, and the url would then disagree with the day the Games tab
// files that same game under.
//
// Derived on every render rather than stored, which is what makes a
// rescheduled game self-healing - syncEvent overwrites startsAt on every pass
// (a rained-out game moves days), and a stored slug would keep insisting on
// the old date forever.
export function buildGameSlug(game: GameSlugInput): string {
	const date = DateTime.fromISO(game.startsAt)
		.setZone(SPORTS_TIME_ZONE)
		.toFormat("yyyy-MM-dd")
	return slugify(
		`${game.league.slug} ${game.awayTeam.name} at ${game.homeTeam.name} ${date}`,
	)
}
