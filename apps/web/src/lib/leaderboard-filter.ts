import { match } from "ts-pattern"
import type { SeasonFilterInput } from "#/graphql/generated/graphql"

// The league rows both leaderboards read out of router context (_app.tsx's
// beforeLoad) - structurally what LeaguesDocument selects, declared here so
// this module doesn't depend on a generated query type.
export type FilterLeague = {
	id: string
	name: string
	abbreviation: string
	slug: string
	currentSeason: { id: string; year: number; displayName: string } | null
	seasons: { id: string; year: number; displayName: string }[]
}

// URL shape: ?league=nba&season=2026, where season is a season year, the
// literal "all", or on a group's board the literal "week". Slugs and years
// rather than uuids so a shared leaderboard link is readable, and because the
// leagues in router context can translate either one to an id before a
// loader runs - no extra round trip.
export type LeaderboardSearch = { league?: string; season?: string }

export const ALL_SEASONS = "all"
// The week in progress, ranked the way Player of the Week is decided. Groups
// only: Player of the Week is a group award.
export const THIS_WEEK = "week"

export type LeaderboardFilter = {
	leagueId: string | null
	season: SeasonFilterInput
	// The league tab and season select read their current value off these
	// rather than re-deriving it from the search params.
	league: FilterLeague | null
	seasonValue: string
	// The week in progress instead of a season. season still holds the
	// current season, for the queries that don't take a week.
	thisWeek: boolean
	// "current season, every league" / "NBA, 2025-26" - for the page subtitle
	// and the empty state, so an empty board says which scope is empty.
	scopeLabel: string
}

// The seasons a league's picker offers, newest first: the ones that have
// started (they're the ones that can have calls) plus the current one, which
// during an offseason is the *upcoming* season and so isn't in that list -
// it's the scope being ranked by default, so it has to be selectable, or the
// picker shows a value you can't pick again after moving off it.
export function pickerSeasons(league: FilterLeague): FilterLeague["seasons"] {
	const seasons = [...league.seasons]
	const current = league.currentSeason
	if (current && !seasons.some((s) => s.id === current.id)) {
		seasons.push(current)
	}
	return seasons.sort((a, b) => b.year - a.year)
}

export function validateLeaderboardSearch(
	search: Record<string, unknown>,
): LeaderboardSearch {
	return {
		league: typeof search.league === "string" ? search.league : undefined,
		season: typeof search.season === "string" ? search.season : undefined,
	}
}

// An unrecognized slug or year falls back to the default rather than
// erroring: a link shared before a league was renamed, or pointing at a
// season this viewer's synced data doesn't have, should land on a sensible
// board instead of a blank one.
//
// A single league has no All tab (see LeaderboardFilters), so it's the
// default instead of a scope nobody can pick. allLeaguesLabel names what the
// All tab ranks, for a caller whose league list isn't every league (a group
// tracking a subset). allowWeek accepts THIS_WEEK, which otherwise falls back
// to the default like any unrecognized value.
export function resolveLeaderboardFilter(
	leagues: FilterLeague[],
	search: LeaderboardSearch,
	options: { allLeaguesLabel?: string; allowWeek?: boolean } = {},
): LeaderboardFilter {
	const league =
		leagues.find((l) => l.slug === search.league) ??
		(leagues.length === 1 ? leagues[0] : null)
	const allLeaguesLabel = options.allLeaguesLabel ?? "every league"

	if (options.allowWeek && search.season === THIS_WEEK) {
		return {
			leagueId: league?.id ?? null,
			season: { scope: "CURRENT" },
			league,
			seasonValue: THIS_WEEK,
			thisWeek: true,
			scopeLabel: league ? `${league.abbreviation}, this week` : "This week",
		}
	}

	const season = match(search.season)
		.with(undefined, () => null)
		.with(ALL_SEASONS, () => ALL_SEASONS)
		.otherwise((value) => {
			// Years only identify a season alongside a league (seasons.year is
			// ESPN's own label and means different things per league), so a year
			// on the All tab is meaningless - fall through to the default.
			if (!league) return null
			const year = Number(value)
			const found = pickerSeasons(league).find((s) => s.year === year)
			return found ? found.id : null
		})

	return match(season)
		.with(null, () => ({
			leagueId: league?.id ?? null,
			season: { scope: "CURRENT" } as SeasonFilterInput,
			league,
			seasonValue: league?.currentSeason?.year.toString() ?? "current",
			thisWeek: false,
			scopeLabel: currentLabel(league, allLeaguesLabel),
		}))
		.with(ALL_SEASONS, () => ({
			leagueId: league?.id ?? null,
			season: { scope: "ALL_TIME" } as SeasonFilterInput,
			league,
			seasonValue: ALL_SEASONS,
			thisWeek: false,
			scopeLabel: league ? `${league.abbreviation}, all time` : "All time",
		}))
		.otherwise((seasonId) => {
			const found = league
				? pickerSeasons(league).find((s) => s.id === seasonId)
				: undefined
			return {
				leagueId: league?.id ?? null,
				season: { scope: "SPECIFIC", seasonId } as SeasonFilterInput,
				league,
				seasonValue: found?.year.toString() ?? ALL_SEASONS,
				thisWeek: false,
				scopeLabel:
					`${league?.abbreviation ?? ""} ${found?.displayName ?? ""}`.trim(),
			}
		})
}

function currentLabel(
	league: FilterLeague | null,
	allLeaguesLabel: string,
): string {
	if (!league) return `Current season, ${allLeaguesLabel}`
	return league.currentSeason
		? `${league.abbreviation} ${league.currentSeason.displayName}`
		: `${league.abbreviation}, current season`
}

// The inverse of the parse above - what to push onto the URL when a tab or
// the select changes. Omits a param at its default so the plain
// /leaderboard URL stays clean.
export function toSearch(
	league: FilterLeague | null,
	seasonValue: string,
): LeaderboardSearch {
	const isDefaultSeason =
		seasonValue === "current" ||
		(league ? seasonValue === league.currentSeason?.year.toString() : false)

	return {
		league: league?.slug,
		season: isDefaultSeason ? undefined : seasonValue,
	}
}
