import { eq } from "drizzle-orm"
import { db } from "../index"
import type { League } from "../schema"
import { games } from "../schema"
import { type EspnEvent, fetchSchedule, fetchTeams } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { findRefEntityId, linkRef, scopedSourceId, type Tx } from "./sync-refs"

// Matched by date range against whatever's synced for this league (see
// sync-seasons.ts, which must run before this file per run.ts's ordering) -
// a game's season is never known some other way. null just leaves
// games.seasonId null for now (nullable this pass - see its own schema
// comment); the next sync run picks it up once the season exists.
async function findSeasonId(
	tx: Tx,
	leagueId: string,
	startsAt: Date,
): Promise<string | null> {
	const leagueSeasons = await tx.query.seasons.findMany({ where: { leagueId } })
	const match = leagueSeasons.find(
		(s) =>
			s.regularSeasonStartsAt <= startsAt &&
			startsAt <= (s.postseasonEndsAt ?? s.regularSeasonEndsAt),
	)
	return match?.id ?? null
}

async function syncEvent(
	tx: Tx,
	leagueSlug: string,
	leagueId: string,
	event: EspnEvent,
): Promise<void> {
	const [home, away] = event.competitions[0].competitors
	const homeTeamId = await findRefEntityId(tx, "team", scopedSourceId(leagueSlug, home.team.id))
	const awayTeamId = await findRefEntityId(tx, "team", scopedSourceId(leagueSlug, away.team.id))
	if (!homeTeamId || !awayTeamId) {
		throw new Error(`syncGames: missing synced team for event ${event.id} - run syncTeams first`)
	}

	const startsAt = new Date(event.date)
	const seasonId = await findSeasonId(tx, leagueId, startsAt)
	const sourceId = scopedSourceId(leagueSlug, event.id)
	const existingId = await findRefEntityId(tx, "game", sourceId)
	if (existingId) {
		await tx
			.update(games)
			.set({ homeTeamId, awayTeamId, startsAt, seasonId })
			.where(eq(games.id, existingId))
		return
	}
	const [row] = await tx
		.insert(games)
		.values({ leagueId, homeTeamId, awayTeamId, startsAt, seasonId })
		.returning()
	if (!row) throw new Error(`syncGames: insert returned nothing for ${event.id}`)
	await linkRef(tx, "game", sourceId, row.id)
}

// Requires syncTeams(config) to have already run for this league - each
// event's home/away teams are looked up via their externalRefs mappings.
// Each event shows up in both teams' schedules; the ESPN event id (via
// externalRefs) is what dedupes it down to one row.
export async function syncGames(config: SyncLeagueConfig, league: League): Promise<void> {
	const espnTeams = await fetchTeams(config.espnPath)

	for (const espnTeam of espnTeams) {
		const schedule = await fetchSchedule(config.espnPath, espnTeam.id)
		for (const event of schedule) {
			await db.transaction((tx) => syncEvent(tx, config.leagueSlug, league.id, event))
		}
	}
}
