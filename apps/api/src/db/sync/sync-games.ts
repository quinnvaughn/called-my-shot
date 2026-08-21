import { eq } from "drizzle-orm"
import { db } from "../index"
import type { League } from "../schema"
import { games } from "../schema"
import { type EspnEvent, fetchSchedule, fetchTeams } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { findRefEntityId, linkRef, scopedSourceId, type Tx } from "./sync-refs"

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
	const sourceId = scopedSourceId(leagueSlug, event.id)
	const existingId = await findRefEntityId(tx, "game", sourceId)
	if (existingId) {
		await tx.update(games).set({ homeTeamId, awayTeamId, startsAt }).where(eq(games.id, existingId))
		return
	}
	const [row] = await tx
		.insert(games)
		.values({ leagueId, homeTeamId, awayTeamId, startsAt })
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
