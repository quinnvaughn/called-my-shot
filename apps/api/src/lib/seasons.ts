import { match } from "ts-pattern"
import { db } from "../db"
import type { Season } from "../db/schema"

// "Current" for a league = the season actually in progress right now
// (regular season through its postseason, if it has one), or if none is in
// progress, the soonest upcoming one, or if nothing upcoming has synced yet,
// the most recently completed one. Deliberately not just "latest
// regularSeasonStartsAt <= now" - that rule alone would call a season whose
// postseason has already fully wrapped "current" for the entire gap before
// the next one starts (e.g. NBA's summer offseason, months long).
//
// Takes rows rather than a leagueId so callers resolving several leagues at
// once (resolveSeasonIds below) can read every league's seasons in one query
// and apply this rule per league in memory, instead of a query per league.
// Rows must all belong to the same league.
export function pickCurrentSeason(rows: Season[]): Season | null {
	if (rows.length === 0) return null

	const now = new Date()
	const inProgress = rows.find(
		(s) =>
			s.regularSeasonStartsAt <= now &&
			now <= (s.postseasonEndsAt ?? s.regularSeasonEndsAt),
	)
	if (inProgress) return inProgress

	const upcoming = rows
		.filter((s) => s.regularSeasonStartsAt > now)
		.sort(
			(a, b) =>
				a.regularSeasonStartsAt.getTime() - b.regularSeasonStartsAt.getTime(),
		)[0]
	if (upcoming) return upcoming

	// Nothing in progress, nothing upcoming synced - fall back to the most
	// recently completed one rather than null, so a lagging sync doesn't leave
	// every game-less question without a season.
	return (
		rows.sort(
			(a, b) =>
				b.regularSeasonStartsAt.getTime() - a.regularSeasonStartsAt.getTime(),
		)[0] ?? null
	)
}

export async function getCurrentSeason(
	leagueId: string,
): Promise<Season | null> {
	const rows = await db.query.seasons.findMany({ where: { leagueId } })
	return pickCurrentSeason(rows)
}

// Every season a league has synced rows for, newest first. startedOnly drops
// the ones whose regular season hasn't begun: the sync always pulls
// [thisYear, thisYear + 1] (db/sync/sync-seasons.ts), so next season's row is
// normally already present, and no question can belong to it yet - offering
// it as a filter would rank a guaranteed-empty board. Callers listing seasons
// for a picker want startedOnly; callers listing them to attach data to (the
// admin ballot list) want all of them.
export async function listLeagueSeasons(
	leagueId: string,
	opts?: { startedOnly?: boolean },
): Promise<Season[]> {
	const rows = await db.query.seasons.findMany({
		where: { leagueId },
		orderBy: { year: "desc" },
	})
	if (!opts?.startedOnly) return rows

	const now = new Date()
	return rows.filter((s) => s.regularSeasonStartsAt <= now)
}

export type SeasonScope = "CURRENT" | "ALL_TIME" | "SPECIFIC"
export type SeasonFilter = { scope: SeasonScope; seasonId?: string | null }

export const ALL_TIME: SeasonFilter = { scope: "ALL_TIME" }

// Which seasons a season-scoped query should count, as ids to filter
// user_season_stats on - null means "every season", an empty array means "no
// season qualifies" (a legitimately empty board, not an unfiltered one).
//
// CURRENT has to be resolved against a league because seasons belong to
// leagues, not to the app: seasons.year is ESPN's own label and means
// different things per league (see its comment in db/schema/sports.ts), so
// there is no single cross-league "current season" to name. With no league in
// scope it therefore means "each league's own current season", unioned - what
// a multi-sport site means by "this season".
export async function resolveSeasonIds(
	filter: SeasonFilter,
	leagueId: string | null,
): Promise<string[] | null> {
	return await match(filter.scope)
		.with("ALL_TIME", async () => null)
		.with("SPECIFIC", async () => {
			// A season id is the only thing that identifies one season across
			// every league, so SPECIFIC is unusable without it.
			if (!filter.seasonId) {
				throw new Error("SPECIFIC season scope requires a seasonId")
			}
			return [filter.seasonId]
		})
		.with("CURRENT", async () => {
			if (leagueId) {
				const season = await getCurrentSeason(leagueId)
				return season ? [season.id] : []
			}

			const rows = await db.query.seasons.findMany()
			const byLeague = new Map<string, Season[]>()
			for (const row of rows) {
				const existing = byLeague.get(row.leagueId)
				if (existing) existing.push(row)
				else byLeague.set(row.leagueId, [row])
			}

			return [...byLeague.values()].flatMap((leagueRows) => {
				const season = pickCurrentSeason(leagueRows)
				return season ? [season.id] : []
			})
		})
		.exhaustive()
}

// Stable identity for a filter, for the per-request leaderboard caches - two
// fields on one page asking for the same scope must share one ranking.
export function seasonFilterKey(filter: SeasonFilter): string {
	return filter.scope === "SPECIFIC"
		? `SPECIFIC:${filter.seasonId ?? ""}`
		: filter.scope
}
