import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"

// Lowercase, alphanumerics only, single dashes between runs, no leading or
// trailing dash. Same rules as the api's ballot slugs (lib/ballot-slug.ts) -
// these are a different kind of slug (derived at render, never stored) but a
// url built by one should look like a url built by the other.
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

// Long enough to carry the words someone would actually search, short enough
// that the whole url still fits a search result's displayed path.
const MAX_QUESTION_SLUG_LENGTH = 60

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

// The question's own title, cut at a word boundary so the slug never ends
// mid-word. Truncation is why this can't be a stored, unique slug: two
// questions whose titles differ only past the cut produce the same string.
// Nothing depends on it being unique - the id ahead of it in the path is what
// identifies the question, and this is decorative.
//
// undefined, not "", for a title slugify leaves empty - titles are free text,
// so "???" is reachable. The callers treat undefined as "this question has no
// slug segment" and use the bare id url; an empty string instead would have
// the detail route redirecting a slugless url to another slugless url on
// every load, which is a redirect loop.
export function buildQuestionSlug(title: string): string | undefined {
	const full = slugify(title)
	if (full.length === 0) return undefined
	if (full.length <= MAX_QUESTION_SLUG_LENGTH) return full

	const cut = full.slice(0, MAX_QUESTION_SLUG_LENGTH)
	const lastDash = cut.lastIndexOf("-")
	// A single word longer than the limit has no boundary to cut at - take the
	// hard cut rather than returning nothing.
	return lastDash > 0 ? cut.slice(0, lastDash) : cut
}

// The path a question's page canonically lives at, slug included when it has
// one. Shared by the detail route's meta tags, the share sheet and the
// sitemap so all three agree on the same url.
export function questionPath(question: { id: string; title: string }): string {
	const slug = buildQuestionSlug(question.title)
	return slug
		? `/questions/${question.id}/${slug}`
		: `/questions/${question.id}`
}
