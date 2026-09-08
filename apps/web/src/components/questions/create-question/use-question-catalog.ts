import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import type {
	GameByIdQuery,
	PlayersByLeagueQuery,
	StatsBySportQuery,
	TeamsByLeagueQuery,
} from "#/graphql/generated/graphql"
import {
	GameByIdDocument,
	PlayersByLeagueDocument,
	StatsBySportDocument,
	TeamsByLeagueDocument,
} from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import type { FormApi } from "#/lib/form/use-form"
import type { CreateQuestionValues } from "./form-context"

export type CatalogTeam = TeamsByLeagueQuery["teams"][number]
export type CatalogPlayer = PlayersByLeagueQuery["players"][number]
export type CatalogStat = StatsBySportQuery["stats"][number]
export type SelectedGame = NonNullable<GameByIdQuery["game"]>

// A stable fallback for the teams/players/stats queries below while they're
// skipped (no league picked yet) or still loading - `?? []` alone would
// hand back a brand-new array every render, which is exactly the kind of
// unstable reference that fed the awardPoolItems infinite loop (see
// use-entity-pools.ts): a new array each render defeats any useMemo that
// takes it as a dependency, since the dependency itself never looks equal
// render to render.
const EMPTY_ARRAY: never[] = []

type Args = {
	form: FormApi<CreateQuestionValues>
	sportId: string
	leagueId: string
	gameId: string | undefined
	subjectTeamId: string | undefined
	subjectPlayerId: string | undefined
	awardConferences: string[]
	awardDivisions: string[]
}

/**
 * Everything the create-question form reads out of the league catalog: the
 * rosters and stat list for the picked league, the picked game, and the
 * conference/division/position/years dropdown options derived from them.
 *
 * Also owns the two effects that keep already-made picks honest when the thing
 * that scoped them changes underneath.
 */
export function useQuestionCatalog({
	form,
	sportId,
	leagueId,
	gameId,
	subjectTeamId,
	subjectPlayerId,
	awardConferences,
	awardDivisions,
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
	// stale-selection effect below only actually re-runs when the picked
	// game's two teams change, not on every render.
	const gameTeamIds = useMemo(
		() =>
			selectedGame
				? new Set([selectedGame.homeTeam.id, selectedGame.awayTeam.id])
				: null,
		[selectedGame],
	)
	// Memoized so the data context's value stays referentially stable while
	// unrelated fields are being typed. Safe to memoize because these are
	// read-only lists - nothing writes back through them, which is also why
	// scopedPlayers must never be handed to PoolSummary (see use-entity-pools).
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

	// Narrowing the pickers above is cosmetic on its own - a subject or option
	// picked before the game was (or before it changed) can still be sitting
	// in form state pointing at a team/player outside the new game's two
	// sides. Only fires once there's an actual game to scope to; deselecting
	// a game doesn't retroactively invalidate picks made under the full
	// league-wide list.
	useEffect(() => {
		if (!gameTeamIds) return
		if (subjectTeamId && !gameTeamIds.has(subjectTeamId)) {
			form.setValue("subjectTeamId", undefined)
		}
		if (subjectPlayerId) {
			const player = players.find((p) => p.id === subjectPlayerId)
			if (!player?.currentTeam || !gameTeamIds.has(player.currentTeam.id)) {
				form.setValue("subjectPlayerId", undefined)
			}
		}
		form.setValue("options", (prev) =>
			prev.filter((option) => {
				if (option.teamId) return gameTeamIds.has(option.teamId)
				if (option.playerId) {
					const player = players.find((p) => p.id === option.playerId)
					return !!player?.currentTeam && gameTeamIds.has(player.currentTeam.id)
				}
				return true
			}),
		)
	}, [gameTeamIds, subjectTeamId, subjectPlayerId, players, form])

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
	const divisionOptions = useMemo(() => {
		if (awardConferences.length === 0) return []
		const values = new Set<string>()
		for (const team of teams) {
			if (
				team.conference &&
				awardConferences.includes(team.conference) &&
				team.division
			) {
				values.add(team.division)
			}
		}
		return Array.from(values).sort()
	}, [teams, awardConferences])
	// Picking divisions is gated on having a conference selected (see
	// requireConferenceBeforeDivision in packages/schemas/src/questions.ts) -
	// deselecting a conference here has to prune any already-picked divisions
	// that no longer belong to a still-selected conference, rather than
	// leaving a stale division picked with nothing left backing it.
	useEffect(() => {
		const allowed = new Set(divisionOptions)
		const next = awardDivisions.filter((division) => allowed.has(division))
		if (next.length !== awardDivisions.length) {
			form.setValue("awardDivisions", next)
		}
	}, [divisionOptions, awardDivisions, form])
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
