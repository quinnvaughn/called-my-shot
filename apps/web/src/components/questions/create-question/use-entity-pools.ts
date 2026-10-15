import { canLeadStat } from "@called-my-shot/schemas"
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

// Every stat leader pool leaves out the positions that can't lead the stat,
// the same cut createQuestion makes - see canLeadStat.
function canLead(
	player: CatalogPlayer,
	leagueSlug: string | undefined,
	statName: string | undefined,
) {
	return !leagueSlug || canLeadStat(player, leagueSlug, statName)
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
	leagueSlug: string | undefined
	// The catalog stat's name. Off-catalog stats leave every position in.
	statName: string | undefined
}

/**
 * The candidate lists each option-based shape picks from.
 *
 * The three pool shapes' lists (award, game stat leader, team stat leader) are
 * also what those shapes submit as `options` (see useCreateQuestionForm), so
 * they're computed once at this level and memoized: each filters the whole
 * league roster, and the form owner re-renders on every keystroke.
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
	leagueSlug,
	statName,
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

	// player_game_stat_leader's pool - both rosters of the picked game, less
	// the positions that can't lead the stat.
	const gameStatLeaderPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (!isGameStatLeader || !gameTeamIds) return null
		return toPlayerItems(
			players.filter(
				(player) =>
					player.currentTeam &&
					gameTeamIds.has(player.currentTeam.id) &&
					canLead(player, leagueSlug, statName),
			),
		)
	}, [isGameStatLeader, gameTeamIds, players, leagueSlug, statName])

	// player_team_season_stat_leader's pool - the picked team's roster, the
	// same one the server derives when the question is created.
	const teamStatLeaderPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (!isTeamSeasonStatLeader || !subjectTeamId) return null
		return toPlayerItems(
			players.filter(
				(player) =>
					player.currentTeam?.id === subjectTeamId &&
					canLead(player, leagueSlug, statName),
			),
		)
	}, [isTeamSeasonStatLeader, subjectTeamId, players, leagueSlug, statName])

	// These two feed OptionList, which only reads them for autocomplete - the
	// creator picks options from them by hand, so unlike the pools above
	// they're never submitted whole and aren't memoized.
	const finalistItems: EntitySearchItem[] | null = isFinalists
		? toPlayerItems(players)
		: null
	// player_season_stat_leader's pool - the whole league to pick from, since
	// nothing scopes it the way gameStatLeaderPoolItems is scoped to a game's
	// two rosters. The creator names the players, but only from the positions
	// that can lead the stat.
	const seasonStatLeaderItems: EntitySearchItem[] | null = isSeasonStatLeader
		? toPlayerItems(
				players.filter((player) => canLead(player, leagueSlug, statName)),
			)
		: null

	return {
		awardPoolItems,
		gameStatLeaderPoolItems,
		teamStatLeaderPoolItems,
		finalistItems,
		seasonStatLeaderItems,
	}
}
