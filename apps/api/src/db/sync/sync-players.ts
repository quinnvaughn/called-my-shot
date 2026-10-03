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

// Roster status types a player is still available under, once isOnRoster has
// already dropped the minors/non-roster entries. Everything else - every IL
// flavor ESPN spells differently by sport ("injured", "injured7", "injured60",
// "15-day-il"), a suspension, bereavement leave - means unavailable, so a new
// designation excludes rather than silently letting someone through.
const AVAILABLE_ROSTER_STATUSES = new Set([
	"active",
	"day-to-day",
	"news",
	"practice-squad",
])

// An `injuries` record is the better signal and wins wherever ESPN files one:
// its status carries the real designation, while `status.type` can flatly
// contradict it - NFL players on season-ending IR come back typed
// "day-to-day". But ESPN leaves `injuries` empty for a chunk of IL stints
// (MLB 7- and 60-day in particular), where the status type is the only thing
// that knows, so its display name stands in.
export function athleteInjuryStatus(athlete: EspnAthlete): string | null {
	const reported = athlete.injuries?.[0]?.status
	if (reported) return reported
	const type = athlete.status?.type?.toLowerCase()
	if (!type || AVAILABLE_ROSTER_STATUSES.has(type)) return null
	return athlete.status?.name ?? type
}

async function syncAthlete(
	leagueSlug: string,
	teamId: string,
	athlete: EspnAthlete,
	rookieEligible: boolean,
	headshotUrl: string | null,
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
					injuryStatus: athleteInjuryStatus(athlete),
					// A source that's down this run keeps the headshot it had.
					...(headshotUrl && { headshotUrl }),
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
				injuryStatus: athleteInjuryStatus(athlete),
				headshotUrl,
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
	// Players the league's image source had no match for, logged once at the
	// end rather than one line each.
	const missingHeadshots: string[] = []

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
			const headshotUrl = config.images
				? await config.images.headshotUrl(athlete, espnTeam)
				: null
			if (config.images && !headshotUrl) missingHeadshots.push(athlete.fullName)
			await syncAthlete(
				config.leagueSlug,
				teamId,
				athlete,
				rookieEligible,
				headshotUrl,
			)
		}
	}
	if (missingHeadshots.length > 0) {
		console.warn(
			`syncPlayers: no ${config.leagueName} headshot for ${missingHeadshots.length} players: ${missingHeadshots.join(", ")}`,
		)
	}
}
