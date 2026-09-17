// Lives here rather than in apps/web because the api builds question urls
// too - the resolution digest's links have to be byte-identical to the ones
// the detail route's meta tags, the share sheet and the sitemap emit, or an
// emailed link lands on a 302 instead of the page.
//
// apps/web/src/lib/slug.ts re-exports all of this. Game urls are here for the
// same reason: the game reminder email links to game pages.

import { SPORTS_TIME_ZONE } from "./time-zone"

// Lowercase, alphanumerics only, single dashes between runs, no leading or
// trailing dash. Same rules as the api's ballot slugs (lib/ballot-slug.ts) -
// those are a different kind of slug (stored and unique, rather than derived
// at render) but a url built by one should look like a url built by the other.
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

// Long enough to carry the words someone would actually search, short enough
// that the whole url still fits a search result's displayed path.
const MAX_QUESTION_SLUG_LENGTH = 60

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
// one. Shared by the detail route's meta tags, the share sheet, the sitemap
// and the resolution digest so all four agree on the same url.
export function questionPath(question: { id: string; title: string }): string {
	const slug = buildQuestionSlug(question.title)
	return slug
		? `/questions/${question.id}/${slug}`
		: `/questions/${question.id}`
}

type GameSlugInput = {
	league: { slug: string }
	homeTeam: { name: string }
	awayTeam: { name: string }
	// An ISO string on the web (off GraphQL), a Date in the api.
	startsAt: string | Date
}

// "yyyy-MM-dd" for the calendar date in SPORTS_TIME_ZONE. en-CA is the locale
// whose short date is already in that order.
const sportsDateFormat = new Intl.DateTimeFormat("en-CA", {
	timeZone: SPORTS_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
})

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
	const date = sportsDateFormat.format(new Date(game.startsAt))
	return slugify(
		`${game.league.slug} ${game.awayTeam.name} at ${game.homeTeam.name} ${date}`,
	)
}

// The path a game's page canonically lives at. Linking to it directly rather
// than to the bare id matters for email: the detail route redirects a missing
// slug, and that redirect drops the utm params the link carries.
export function gamePath(game: GameSlugInput & { id: string }): string {
	return `/games/${game.id}/${buildGameSlug(game)}`
}
