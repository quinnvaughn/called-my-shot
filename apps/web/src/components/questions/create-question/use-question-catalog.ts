import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type {
	GameByIdQuery,
	PlayersByLeagueQuery,
	StatsBySportQuery,
	TeamsByLeagueQuery,
} from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	PlayersByLeagueDocument,
	StatsBySportDocument,
	TeamsByLeagueDocument,
} from "#/graphql/sports/catalog/queries"
import { GameByIdDocument } from "#/graphql/sports/games/queries"

export type CatalogTeam = TeamsByLeagueQuery["teams"][number]
export type CatalogPlayer = PlayersByLeagueQuery["players"][number]
export type CatalogStat = StatsBySportQuery["stats"][number]
export type SelectedGame = NonNullable<GameByIdQuery["game"]>

// A stable fallback for the teams/players/stats queries below while they're
// skipped (no league picked yet) or still loading - `?? []` alone would
// hand back a brand-new array every render, which defeats any useMemo that
// takes it as a dependency, since the dependency itself never looks equal
// render to render.
const EMPTY_ARRAY: never[] = []

// The divisions present in the roster under the given conferences - empty
// until a conference is picked, since a division name like "South" repeats
// across conferences.
export function divisionsIn(
	teams: CatalogTeam[],
	conferences: string[],
): string[] {
	if (conferences.length === 0) return []
	const values = new Set<string>()
	for (const team of teams) {
		if (
			team.conference &&
			conferences.includes(team.conference) &&
			team.division
		) {
			values.add(team.division)
		}
	}
	return Array.from(values).sort()
}

type Args = {
	sportId: string
	leagueId: string
	gameId: string | undefined
	awardConferences: string[]
}

/**
 * Everything the create-question form reads out of the league catalog: the
 * rosters and stat list for the picked league, the picked game, and the
 * conference/division/position/years dropdown options derived from them.
 */
export function useQuestionCatalog({
	sportId,
	leagueId,
	gameId,
	awardConferences,
}: Args) {
	const { data: teamsData } = useQuery(
		gqlQueryOptions(
			TeamsByLeagueDocument,
			{ leagueId },
			{ enabled: !!leagueId },
		),
	)
	const { data: playersData } = useQuery(
		gqlQueryOptions(
			PlayersByLeagueDocument,
			{ leagueId },
			{ enabled: !!leagueId },
		),
	)
	const { data: statsData } = useQuery(
		gqlQueryOptions(StatsBySportDocument, { sportId }, { enabled: !!sportId }),
	)
	// Fetched here (not just inside GameField) because a picked game also
	// narrows every team/player picker below to its own two sides - you can't
	// pick the Cleveland Cavaliers as the subject of a Denver @ Boston game.
	const { data: selectedGameData } = useQuery(
		gqlQueryOptions(
			GameByIdDocument,
			{ id: gameId ?? "" },
			{ enabled: !!gameId },
		),
	)
	const selectedGame = selectedGameData?.game ?? null

	const teams: CatalogTeam[] = teamsData?.teams ?? EMPTY_ARRAY
	const players: CatalogPlayer[] = playersData?.players ?? EMPTY_ARRAY
	const stats: CatalogStat[] = statsData?.stats ?? EMPTY_ARRAY

	// Stable across renders (unlike a plain `new Set(...)` literal) so the
	// memos below only recompute when the picked game's two teams change.
	const gameTeamIds = useMemo(
		() =>
			selectedGame
				? new Set([selectedGame.homeTeam.id, selectedGame.awayTeam.id])
				: null,
		[selectedGame],
	)
	// Memoized so the data context's value stays referentially stable while
	// unrelated fields are being typed.
	const scopedTeams = useMemo(
		() =>
			gameTeamIds ? teams.filter((team) => gameTeamIds.has(team.id)) : teams,
		[gameTeamIds, teams],
	)
	const scopedPlayers = useMemo(
		() =>
			gameTeamIds
				? players.filter(
						(player) =>
							player.currentTeam && gameTeamIds.has(player.currentTeam.id),
					)
				: players,
		[gameTeamIds, players],
	)

	// Distinct conference/division/position values actually present in the
	// picked league's own roster - a plain dropdown of real options rather
	// than a freeform text field, even though the underlying columns are
	// freetext (see teams.conference/division, players.positions). Division
	// options are conference-scoped (empty until a conference is picked) since
	// a division name like "South" repeats across conferences.
	const conferenceOptions = useMemo(() => {
		const values = new Set<string>()
		for (const team of teams) if (team.conference) values.add(team.conference)
		return Array.from(values).sort()
	}, [teams])
	const divisionOptions = useMemo(
		() => divisionsIn(teams, awardConferences),
		[teams, awardConferences],
	)
	const positionOptions = useMemo(() => {
		const values = new Set<string>()
		for (const player of players)
			for (const position of player.positions) values.add(position)
		return Array.from(values).sort()
	}, [players])
	// Distinct seasonsInLeague values actually present in the roster, same
	// "real options only" reasoning as positionOptions above - numeric, so
	// sorted ascending rather than alphabetically.
	const yearsInLeagueOptions = useMemo(() => {
		const values = new Set<number>()
		for (const player of players) values.add(player.seasonsInLeague)
		return Array.from(values).sort((a, b) => a - b)
	}, [players])

	return {
		teams,
		players,
		stats,
		selectedGame,
		gameTeamIds,
		scopedTeams,
		scopedPlayers,
		conferenceOptions,
		divisionOptions,
		positionOptions,
		yearsInLeagueOptions,
	}
}
