import { useMemo } from "react"
import type { EntitySearchItem } from "./entity-search-field"
import type { CatalogPlayer, CatalogTeam } from "./use-question-catalog"

export function toPlayerItems(players: CatalogPlayer[]): EntitySearchItem[] {
	return players.map((player) => ({
		id: player.id,
		label: player.name,
		kind: "player" as const,
		meta: player.currentTeam?.abbreviation,
		image: { player },
	}))
}

export function toTeamItems(teams: CatalogTeam[]): EntitySearchItem[] {
	return teams.map((team) => ({
		id: team.id,
		label: team.name,
		kind: "team" as const,
		meta: team.abbreviation,
		image: { team },
	}))
}

type Args = {
	isPlayerAward: boolean
	isTeamAward: boolean
	isGameStatLeader: boolean
	isSeasonStatLeader: boolean
	isTeamSeasonStatLeader: boolean
	isFinalists: boolean
	teams: CatalogTeam[]
	players: CatalogPlayer[]
	gameTeamIds: Set<string> | null
	subjectTeamId: string | undefined
	awardConferences: string[]
	awardDivisions: string[]
	awardPositions: string[]
	awardSeasonsInLeague: number[]
	awardRookieOnly: boolean
}

/**
 * The candidate lists each option-based shape picks from.
 *
 * Two of these feed PoolSummary, which syncs its items straight into `options`
 * through an effect keyed on that same array - and `options` is watched right
 * back by the form owner. A fresh array reference on every render would
 * retrigger that effect every render, which changes options, which re-renders,
 * forever ("Maximum update depth exceeded"). That is why they're memoized here
 * rather than recomputed inline, and why they must be computed once at this
 * level rather than inside a panel that re-renders on every `options` write.
 */
export function useEntityPools({
	isPlayerAward,
	isTeamAward,
	isGameStatLeader,
	isSeasonStatLeader,
	isTeamSeasonStatLeader,
	isFinalists,
	teams,
	players,
	gameTeamIds,
	subjectTeamId,
	awardConferences,
	awardDivisions,
	awardPositions,
	awardSeasonsInLeague,
	awardRookieOnly,
}: Args) {
	// player_season_award/team_season_award's pool is always the full league
	// roster (see pool-summary.tsx) - player_award_finalists' is a small,
	// admin-curated shortlist of real announced finalists instead (see
	// option-list.tsx). Neither is scoped to a picked game since none of
	// these three shapes are game-scoped in the first place.
	const awardPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (isPlayerAward) {
			return toPlayerItems(
				players.filter((player) => {
					if (
						awardConferences.length &&
						(!player.currentTeam?.conference ||
							!awardConferences.includes(player.currentTeam.conference))
					) {
						return false
					}
					if (
						awardDivisions.length &&
						(!player.currentTeam?.division ||
							!awardDivisions.includes(player.currentTeam.division))
					) {
						return false
					}
					if (
						awardPositions.length &&
						!player.positions.some((position) =>
							awardPositions.includes(position),
						)
					) {
						return false
					}
					if (
						awardSeasonsInLeague.length &&
						!awardSeasonsInLeague.includes(player.seasonsInLeague)
					) {
						return false
					}
					if (awardRookieOnly && !player.rookieEligible) {
						return false
					}
					return true
				}),
			)
		}
		if (isTeamAward) {
			return toTeamItems(
				teams.filter((team) => {
					if (
						awardConferences.length &&
						(!team.conference || !awardConferences.includes(team.conference))
					) {
						return false
					}
					if (
						awardDivisions.length &&
						(!team.division || !awardDivisions.includes(team.division))
					) {
						return false
					}
					return true
				}),
			)
		}
		return null
	}, [
		isPlayerAward,
		isTeamAward,
		players,
		teams,
		awardConferences,
		awardDivisions,
		awardPositions,
		awardSeasonsInLeague,
		awardRookieOnly,
	])

	// player_game_stat_leader's pool - both rosters of the picked game, no
	// filters to narrow it further (unlike the award pool above, there's no
	// real-world conference/division/position split a game-scoped stat leader
	// could be narrowed by). Same auto-sync-into-options mechanism as
	// PoolSummary/awardPoolItems above, so it needs the same stable-reference
	// memoization to avoid retriggering PoolSummary's own sync effect every
	// render.
	const gameStatLeaderPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (!isGameStatLeader || !gameTeamIds) return null
		return toPlayerItems(
			players.filter(
				(player) =>
					player.currentTeam && gameTeamIds.has(player.currentTeam.id),
			),
		)
	}, [isGameStatLeader, gameTeamIds, players])

	// player_team_season_stat_leader's pool - the picked team's roster, the
	// same one the server derives when the question is created. Memoized for
	// the same PoolSummary reason as the game-scoped pool above.
	const teamStatLeaderPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (!isTeamSeasonStatLeader || !subjectTeamId) return null
		return toPlayerItems(
			players.filter((player) => player.currentTeam?.id === subjectTeamId),
		)
	}, [isTeamSeasonStatLeader, subjectTeamId, players])

	// These two feed OptionList, which only reads them for autocomplete and
	// never writes back - so unlike the two above they don't need a stable
	// reference and aren't memoized.
	const finalistItems: EntitySearchItem[] | null = isFinalists
		? toPlayerItems(players)
		: null
	// player_season_stat_leader's pool - the whole league to pick from, since
	// nothing scopes it the way gameStatLeaderPoolItems is scoped to a game's
	// two rosters.
	const seasonStatLeaderItems: EntitySearchItem[] | null = isSeasonStatLeader
		? toPlayerItems(players)
		: null

	return {
		awardPoolItems,
		gameStatLeaderPoolItems,
		teamStatLeaderPoolItems,
		finalistItems,
		seasonStatLeaderItems,
	}
}
