import { eq } from "drizzle-orm"
import { db } from "../index"
import { players } from "../schema"
import {
	defaultEspnClient,
	type EspnAthlete,
	type EspnClient,
} from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { findRefEntityId, linkRef, scopedSourceId } from "./sync-refs"

// ESPN only returns the multi-position `positions` array for baseball, where
// eligibility at several spots is a real thing. Football and basketball
// athletes come back with the scalar `position` alone, so reading `positions`
// straight through would store an empty array for every NFL and NBA player -
// and buildPlayerPool (lib/award-pool.ts) filters awardPositions against this
// column, not the scalar, so those players would drop out of every positional
// award pool entirely. Falling back to the scalar keeps one column answering
// "what can this player be picked for" across all three sports.
function athletePositions(athlete: EspnAthlete): string[] {
	const listed = athlete.positions?.map((p) => p.abbreviation) ?? []
	if (listed.length > 0) return listed
	return athlete.position?.abbreviation ? [athlete.position.abbreviation] : []
}

async function syncAthlete(
	leagueSlug: string,
	teamId: string,
	athlete: EspnAthlete,
	rookieEligible: boolean,
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
					positions: athletePositions(athlete),
					currentTeamId: teamId,
					seasonsInLeague: athlete.experience?.years ?? 0,
					rookieEligible,
				})
				.where(eq(players.id, existingId))
			return
		}
		const [row] = await tx
			.insert(players)
			.values({
				name: athlete.fullName,
				position: athlete.position?.abbreviation ?? null,
				positions: athletePositions(athlete),
				currentTeamId: teamId,
				seasonsInLeague: athlete.experience?.years ?? 0,
				rookieEligible,
			})
			.returning()
		if (!row)
			throw new Error(`syncPlayers: insert returned nothing for ${athlete.id}`)
		await linkRef(tx, "player", sourceId, row.id)
	})
}

// Requires syncTeams(config) to have already run for this league - each ESPN
// team's synced row is looked up via its externalRefs mapping. currentSeasonYear
// comes from syncSeasons having already run too (see run.ts) - only needed by
// leagues with a resolveRookieEligible hook (MLB), which needs to know which
// prior seasons' stats actually count as "before this season."
export async function syncPlayers(
	config: SyncLeagueConfig,
	currentSeasonYear: number,
	espn: EspnClient = defaultEspnClient,
): Promise<void> {
	const espnTeams = await espn.fetchTeams(config.espnPath)

	for (const espnTeam of espnTeams) {
		const teamId = await db.transaction((tx) =>
			findRefEntityId(
				tx,
				"team",
				scopedSourceId(config.leagueSlug, espnTeam.id),
			),
		)
		if (!teamId) {
			// Usually means syncTeams hasn't run yet for this league, but can
			// also mean it ran and deliberately skipped this entry (e.g. a
			// non-franchise team ESPN's list included with no color - see
			// sync-teams.ts) - either way, nothing to attach a roster to.
			console.warn(
				`syncPlayers: no synced team found for ESPN team ${espnTeam.id} (${espnTeam.abbreviation}) - skipping its roster`,
			)
			continue
		}
		const roster = await espn.fetchRoster(config.espnPath, espnTeam.id)
		for (const athlete of roster) {
			// A handful of roster entries (two-way/practice squad placeholders)
			// come back with no name - nothing useful to store, skip them.
			if (!athlete.fullName) continue
			const rookieEligible = config.resolveRookieEligible
				? await config.resolveRookieEligible(
						athlete,
						espnTeam.displayName,
						currentSeasonYear,
					)
				: (athlete.experience?.years ?? 0) === 0
			await syncAthlete(config.leagueSlug, teamId, athlete, rookieEligible)
		}
	}
}
