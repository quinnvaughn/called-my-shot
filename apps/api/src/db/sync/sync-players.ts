import { eq } from "drizzle-orm"
import { db } from "../index"
import { players } from "../schema"
import { type EspnAthlete, fetchRoster, fetchTeams } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { findRefEntityId, linkRef, scopedSourceId } from "./sync-refs"

async function syncAthlete(
	leagueSlug: string,
	teamId: string,
	athlete: EspnAthlete,
): Promise<void> {
	const sourceId = scopedSourceId(leagueSlug, athlete.id)
	await db.transaction(async (tx) => {
		const existingId = await findRefEntityId(tx, "player", sourceId)
		if (existingId) {
			await tx
				.update(players)
				.set({
					name: athlete.fullName,
					position: athlete.position?.abbreviation ?? null,
					positions: athlete.positions?.map((p) => p.abbreviation) ?? [],
					currentTeamId: teamId,
					seasonsInLeague: athlete.experience?.years ?? 0,
				})
				.where(eq(players.id, existingId))
			return
		}
		const [row] = await tx
			.insert(players)
			.values({
				name: athlete.fullName,
				position: athlete.position?.abbreviation ?? null,
				positions: athlete.positions?.map((p) => p.abbreviation) ?? [],
				currentTeamId: teamId,
				seasonsInLeague: athlete.experience?.years ?? 0,
			})
			.returning()
		if (!row) throw new Error(`syncPlayers: insert returned nothing for ${athlete.id}`)
		await linkRef(tx, "player", sourceId, row.id)
	})
}

// Requires syncTeams(config) to have already run for this league - each ESPN
// team's synced row is looked up via its externalRefs mapping.
export async function syncPlayers(config: SyncLeagueConfig): Promise<void> {
	const espnTeams = await fetchTeams(config.espnPath)

	for (const espnTeam of espnTeams) {
		const teamId = await db.transaction((tx) =>
			findRefEntityId(tx, "team", scopedSourceId(config.leagueSlug, espnTeam.id)),
		)
		if (!teamId) {
			throw new Error(
				`syncPlayers: no synced team found for ESPN team ${espnTeam.id} (${espnTeam.abbreviation}) - run syncTeams first`,
			)
		}
		const roster = await fetchRoster(config.espnPath, espnTeam.id)
		for (const athlete of roster) {
			// A handful of roster entries (two-way/practice squad placeholders)
			// come back with no name - nothing useful to store, skip them.
			if (!athlete.fullName) continue
			await syncAthlete(config.leagueSlug, teamId, athlete)
		}
	}
}
