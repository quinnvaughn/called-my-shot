import { createQuestionSchema } from "@called-my-shot/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { useEffect, useMemo, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { DATE_TIME_PICKER_VALUE_FORMAT } from "#/components/ui/date-time-picker"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { MultiSelect } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import type {
	AwardVerb,
	QuestionShape,
	SportsQuery,
	StatAggregation,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { CreateQuestionDocument } from "#/graphql/mutations/questions"
import {
	GameByIdDocument,
	PlayersByLeagueDocument,
	StatsBySportDocument,
	TeamsByLeagueDocument,
} from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { track } from "#/lib/analytics"
import { isRateToleranceTier } from "#/lib/field-signal"
import { useForm } from "#/lib/form/use-form"
import { BallotField } from "./ballot-field"
import { buildTitlePreview } from "./build-title-preview"
import type { EntitySearchItem } from "./entity-search-field"
import { ChipField, FormProvider } from "./form-context"
import { GameField } from "./game-field"
import { LeagueField } from "./league-field"
import { OfficialToggle } from "./official-toggle"
import { OptionList } from "./option-list"
import { PoolSummary } from "./pool-summary"
import { QuestionTypePicker } from "./question-type-picker"
import { ResolutionFields } from "./resolution-fields"
import { Section } from "./section"
import { StatPicker } from "./stat-picker"
import { SubjectPicker } from "./subject-picker"

// A stable fallback for the teams/players/stats queries below while they're
// skipped (no league picked yet) or still loading - `?? []` alone would
// hand back a brand-new array every render, which is exactly the kind of
// unstable reference that fed the awardPoolItems infinite loop (see its own
// comment further down): a new array each render defeats any useMemo that
// takes it as a dependency, since the dependency itself never looks equal
// render to render.
const EMPTY_ARRAY: never[] = []

// player_season_award/team_season_award/player_award_finalists can only ever
// be posted as official - see questionShapeSchema's ADMIN_ONLY_SHAPES in
// packages/schemas/src/questions.ts. Kept as its own small list here (rather
// than imported) since QuestionTypePicker already filters these out of the
// picker for non-admins - by the time one of these three is selected, the
// viewer is guaranteed to be an admin.
const ADMIN_ONLY_SHAPES = [
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
] as const

// A MultiSelect.Trigger's label - lists the picks by name up to a point,
// then falls back to a count once that'd make the trigger unreadably wide
// (an NFL position list, a many-division race).
function multiSelectSummary(values: string[], emptyLabel: string): string {
	if (values.length === 0) return emptyLabel
	if (values.length <= 3) return values.join(", ")
	return `${values.length} selected`
}

// "Rookie (0)" / "1 year" / "2 years" - shared between the option labels in
// the years-in-league MultiSelect below and the pool summary's scopeLabel, so
// the two can't drift.
function yearsInLeagueLabel(years: number): string {
	return years === 0
		? "Rookie (0)"
		: `${years} ${years === 1 ? "year" : "years"}`
}

type Props = {
	sports: SportsQuery["sports"]
	isAdmin: boolean
	// Set when arriving from the admin Ballots builder's "+ New Question"
	// button - see new-question.tsx's validateSearch.
	lockedBallotId?: string
}

export function CreateQuestionForm({ sports, isAdmin, lockedBallotId }: Props) {
	const [hasSelectedType, setHasSelectedType] = useState(false)
	const [titleEdited, setTitleEdited] = useState(false)
	const createQuestion = useGqlMutation(CreateQuestionDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const form = useForm({
		schema: createQuestionSchema,
		defaultValues: {
			shape: "player_stat_over_under",
			title: "",
			sportId: "",
			leagueId: "",
			gameId: undefined,
			resolutionSource: "",
			resolutionSourceUrl: "",
			locksAt: "",
			isOfficial: false,
			options: [],
			statId: undefined,
			customStat: "",
			ouLine: undefined,
			statAggregation: undefined,
			subjectTeamId: undefined,
			subjectPlayerId: undefined,
			picksRequired: 1,
			awardVerb: undefined,
			eventClause: "",
			awardName: "",
			awardConferences: [],
			awardDivisions: [],
			awardPositions: [],
			awardSeasonsInLeague: [],
			awardRookieOnly: false,
			ballot: undefined,
		},
		onSubmit: async (values, helpers) => {
			const data = await createQuestion.mutateAsync({
				input: {
					shape: values.shape.toUpperCase() as QuestionShape,
					title: values.title,
					sportId: values.sportId,
					leagueId: values.leagueId,
					gameId: values.gameId,
					resolutionSource: values.resolutionSource,
					resolutionSourceUrl: values.resolutionSourceUrl || undefined,
					// values.locksAt is a naive "yyyy-MM-dd'T'HH:mm" string with no
					// offset - the picker's clock is always the browser's own, so
					// converting it to UTC has to happen here, in that same
					// timezone, rather than trusting the API to guess (it can't -
					// it has no idea what timezone the creator meant).
					locksAt:
						DateTime.fromFormat(values.locksAt, DATE_TIME_PICKER_VALUE_FORMAT)
							.toUTC()
							.toISO() ?? values.locksAt,
					isOfficial: values.isOfficial,
					options: values.options.map((option) => ({
						label: option.label,
						teamId: option.teamId,
						playerId: option.playerId,
					})),
					statId: values.statId,
					customStat: values.customStat || undefined,
					ouLine: values.ouLine,
					statAggregation: values.statAggregation
						? (values.statAggregation.toUpperCase() as StatAggregation)
						: undefined,
					subjectTeamId: values.subjectTeamId,
					subjectPlayerId: values.subjectPlayerId,
					picksRequired: values.picksRequired,
					awardVerb: values.awardVerb
						? (values.awardVerb.toUpperCase() as AwardVerb)
						: undefined,
					eventClause: values.eventClause || undefined,
					awardName: values.awardName || undefined,
					awardConferences: values.awardConferences,
					awardDivisions: values.awardDivisions,
					awardPositions: values.awardPositions,
					awardSeasonsInLeague: values.awardSeasonsInLeague,
					awardRookieOnly: values.awardRookieOnly,
					ballot: values.ballot
						? {
								ballotId: values.ballot.ballotId,
								label: values.ballot.label,
								slot: values.ballot.slot || undefined,
							}
						: undefined,
				},
			})
			const result = data?.createQuestion

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "AuthenticationError" }, async () => {
					helpers.setFormError("You need to sign in to create a question.")
				})
				.with({ __typename: "AuthorizationError" }, async () => {
					helpers.setFormError("Only admins can post official questions.")
				})
				.with({ __typename: "QuestionPayload" }, async (r) => {
					track("question_created", {
						questionId: r.question.id,
						shape: values.shape,
						sportId: values.sportId,
						leagueId: values.leagueId,
						isOfficial: values.isOfficial ?? false,
					})
					await queryClient.invalidateQueries()
					await router.invalidate()
					await navigate({
						to: "/questions/$questionId/{-$slug}",
						params: { questionId: r.question.id },
					})
				})
				.exhaustive()
		},
	})

	const shape = form.useWatch("shape")
	const sportId = form.useWatch("sportId")
	const leagueId = form.useWatch("leagueId")
	const gameId = form.useWatch("gameId")
	const options = form.useWatch("options")
	const subjectTeamId = form.useWatch("subjectTeamId")
	const subjectPlayerId = form.useWatch("subjectPlayerId")
	const statId = form.useWatch("statId")
	const customStat = form.useWatch("customStat")
	const ouLine = form.useWatch("ouLine")
	const statAggregation = form.useWatch("statAggregation")
	const awardName = form.useWatch("awardName")
	const awardConferences = form.useWatch("awardConferences")
	const awardDivisions = form.useWatch("awardDivisions")
	const awardPositions = form.useWatch("awardPositions")
	const awardSeasonsInLeague = form.useWatch("awardSeasonsInLeague")
	const awardRookieOnly = form.useWatch("awardRookieOnly")
	const eventClause = form.useWatch("eventClause")
	const picksRequired = form.useWatch("picksRequired")
	const awardVerb = form.useWatch("awardVerb")
	// Reads the whole `ballot` value rather than a dotted "ballot.ballotId" path
	// - see ballot-field.tsx's comment on why nested paths under this optional
	// object don't type-check correctly with this form hook.
	const ballotId = form.useWatch("ballot")?.ballotId

	// A ballot question is always official (see createQuestionSchema's
	// superRefine) - forced the moment a ballot is picked rather than left for
	// the admin to remember to also flip the toggle.
	useEffect(() => {
		if (ballotId) form.setValue("isOfficial", true)
	}, [ballotId, form])

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

	const teams = teamsData?.teams ?? EMPTY_ARRAY
	const players = playersData?.players ?? EMPTY_ARRAY
	const stats = statsData?.stats ?? EMPTY_ARRAY

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
	const scopedTeams = gameTeamIds
		? teams.filter((team) => gameTeamIds.has(team.id))
		: teams
	const scopedPlayers = gameTeamIds
		? players.filter(
				(player) =>
					player.currentTeam && gameTeamIds.has(player.currentTeam.id),
			)
		: players

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

	const isPlayerStatOU = shape === "player_stat_over_under"
	const isTeamStatOU = shape === "team_stat_over_under"
	const isPlayerSeasonOU = shape === "player_season_stat_over_under"
	const isTeamSeasonOU = shape === "team_season_stat_over_under"
	const isGameTotalOU = shape === "game_total_over_under"
	const isAnyOU =
		isPlayerStatOU ||
		isTeamStatOU ||
		isPlayerSeasonOU ||
		isTeamSeasonOU ||
		isGameTotalOU
	const isPlayerNumeric = shape === "player_stat_numeric_guess"
	const isTeamNumeric = shape === "team_stat_numeric_guess"
	const isTeamSeasonNumeric = shape === "team_season_stat_numeric_guess"
	const isPlayerVsPlayer = shape === "player_vs_player"
	const isPlayerVsPlayerSeason = shape === "player_vs_player_season"
	const isTeamVsTeam = shape === "team_vs_team"
	const isTeamVsTeamSeason = shape === "team_vs_team_season"
	const isGameStatLeader = shape === "player_game_stat_leader"
	const isSeasonStatLeader = shape === "player_season_stat_leader"
	const isYesNo = shape === "yes_no_prop"
	const isPlayerAward = shape === "player_season_award"
	const isTeamAward = shape === "team_season_award"
	const isAnyAward = isPlayerAward || isTeamAward
	const isFinalists = shape === "player_award_finalists"
	const isAdminOnlyShape = (ADMIN_ONLY_SHAPES as readonly string[]).includes(
		shape,
	)

	// player_season_award/team_season_award's pool is always the full league
	// roster (see pool-summary.tsx) - player_award_finalists' is a small,
	// admin-curated shortlist of real announced finalists instead (see
	// option-list.tsx). Neither is scoped to a picked game since none of
	// these three shapes are game-scoped in the first place.
	// Memoized, not recomputed inline: PoolSummary syncs this straight into
	// options via a useEffect keyed on this same array (see pool-summary.tsx),
	// which watches options right back (see the `options` useWatch above) - a
	// fresh array reference here on every render, from every render, would
	// retrigger that effect every time, which changes options, which
	// retriggers this component, forever ("Maximum update depth exceeded").
	// Stable across renders unless the underlying roster actually changes.
	const awardPoolItems: EntitySearchItem[] | null = useMemo(() => {
		if (isPlayerAward) {
			return players
				.filter((player) => {
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
				})
				.map((player) => ({
					id: player.id,
					label: player.name,
					kind: "player" as const,
					meta: player.currentTeam?.abbreviation,
				}))
		}
		if (isTeamAward) {
			return teams
				.filter((team) => {
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
				})
				.map((team) => ({
					id: team.id,
					label: team.name,
					kind: "team" as const,
					meta: team.abbreviation,
				}))
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
		return players
			.filter(
				(player) =>
					player.currentTeam && gameTeamIds.has(player.currentTeam.id),
			)
			.map((player) => ({
				id: player.id,
				label: player.name,
				kind: "player" as const,
				meta: player.currentTeam?.abbreviation,
			}))
	}, [isGameStatLeader, gameTeamIds, players])

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
	const finalistItems: EntitySearchItem[] | null = isFinalists
		? players.map((player) => ({
				id: player.id,
				label: player.name,
				kind: "player" as const,
				meta: player.currentTeam?.abbreviation,
			}))
		: null

	// player_season_stat_leader's pool - the whole league to pick from, since
	// nothing scopes it the way gameStatLeaderPoolItems is scoped to a game's
	// two rosters. Not memoized like awardPoolItems/gameStatLeaderPoolItems:
	// those feed PoolSummary, which syncs them into options through an effect
	// that a fresh array reference every render would retrigger forever. This
	// one feeds OptionList, which only reads it for autocomplete and never
	// writes back, same as finalistItems above.
	const seasonStatLeaderItems: EntitySearchItem[] | null = isSeasonStatLeader
		? players.map((player) => ({
				id: player.id,
				label: player.name,
				kind: "player" as const,
				meta: player.currentTeam?.abbreviation,
			}))
		: null

	function selectType(next: typeof shape) {
		form.setValue("shape", next)
		setHasSelectedType(true)
		// The rest of the form only renders once a type's picked, and League is
		// always its first field regardless of which shape branch renders (see
		// the data-field="league" marker in league-field.tsx) - jump straight to
		// it and focus it, rather than just nudging the scroll position, so
		// picking a card visibly lands the viewer on the next thing to fill in.
		requestAnimationFrame(() => {
			const input = document.querySelector<HTMLInputElement>(
				'[data-field="league"] input',
			)
			input?.scrollIntoView({ behavior: "smooth", block: "center" })
			input?.focus({ preventScroll: true })
		})
		// Shape-specific fields from whatever was previously selected shouldn't
		// leak into the newly chosen shape's submission. The head-to-head
		// shapes get their 2 fixed slots pre-seeded here rather than grown/
		// shrunk by OptionList itself (see its exactCount prop) - there's never
		// a valid state with anything other than exactly 2 for these.
		form.setValue(
			"options",
			next === "player_vs_player" ||
				next === "player_vs_player_season" ||
				next === "team_vs_team_season"
				? [{ label: "" }, { label: "" }]
				: [],
		)
		// The season-scoped shapes never take a game at all (that's the whole
		// reason they're separate shapes from their game-scoped counterparts) -
		// GameField won't even render for them, so a stale gameId/locksAt from
		// whatever was previously selected has to be cleared here instead of
		// leaving it for the creator to notice and clear themselves. Every other
		// shape switch still carries a picked game forward as a convenience
		// (e.g. switching from team_vs_team to game_total_over_under for that
		// same matchup).
		if (
			next === "player_season_stat_over_under" ||
			next === "team_season_stat_over_under" ||
			next === "player_vs_player_season" ||
			next === "team_vs_team_season" ||
			next === "team_season_stat_numeric_guess" ||
			next === "player_season_stat_leader"
		) {
			form.setValue("gameId", undefined)
			form.setValue("locksAt", "")
		}
		form.setValue("statId", undefined)
		form.setValue("customStat", "")
		form.setValue("ouLine", undefined)
		form.setValue("statAggregation", undefined)
		form.setValue("subjectTeamId", undefined)
		form.setValue("subjectPlayerId", undefined)
		form.setValue("picksRequired", 1)
		form.setValue("awardVerb", undefined)
		form.setValue("eventClause", "")
		form.setValue("awardName", "")
		form.setValue("awardConferences", [])
		form.setValue("awardDivisions", [])
		form.setValue("awardPositions", [])
		form.setValue("awardSeasonsInLeague", [])
		form.setValue("awardRookieOnly", false)
		if ((ADMIN_ONLY_SHAPES as readonly string[]).includes(next)) {
			form.setValue("isOfficial", true)
		}
	}

	// Mirrors generateQuestionTitle's own server-side call (see createQuestion
	// in apps/api's resolver) against whatever's filled in so far - null once
	// any piece it needs is still missing, rather than a half-built string.
	const selectedStat = statId
		? stats.find((stat) => stat.id === statId)
		: undefined
	const selectedStatName = selectedStat?.name
	const statName = selectedStatName ?? customStat
	// A rate stat (batting average, ERA) always displays its line/guess padded
	// to a fixed 3 decimals - a trailing zero is meaningful there (".300" is a
	// real, distinct value from ".3"), so a bare number embedded straight into
	// the title/option labels would silently misrepresent it. See formatGuess
	// in #/lib/field-signal. Also picks "more" vs "a higher" for the season
	// head-to-head titles below.
	const isRateStat = isRateToleranceTier(selectedStat?.toleranceTier)

	// player_season_stat_leader only - the one shape where total-vs-per-game is
	// genuinely optional rather than required. It disambiguates a counting stat
	// ("the most points this season" vs "the most points per game") and nothing
	// else: a rate stat is already a rate, and a freeform customStat can't be
	// classified either way. So it's offered only for a catalog counting stat,
	// and when it isn't offered statAggregation stays undefined and the title
	// states no aggregation at all.
	const offersStatAggregation =
		isSeasonStatLeader && !!selectedStat && !isRateStat

	// The stat can change after an aggregation was already picked (Points, "per
	// game", then retyped as a freeform metric) - without this the abandoned
	// value would still submit and still put "per game" in the title.
	useEffect(() => {
		if (isSeasonStatLeader && !offersStatAggregation && statAggregation) {
			form.setValue("statAggregation", undefined)
		}
	}, [isSeasonStatLeader, offersStatAggregation, statAggregation, form])
	const selectedPlayerName = subjectPlayerId
		? players.find((player) => player.id === subjectPlayerId)?.name
		: undefined
	const selectedTeamName = subjectTeamId
		? teams.find((team) => team.id === subjectTeamId)?.name
		: undefined
	const subjectName = selectedPlayerName ?? selectedTeamName ?? null

	// player_stat_over_under/team_stat_over_under/player_stat_numeric_guess/
	// team_stat_numeric_guess only - the game's other team, named in the title
	// so "over/under 27.5 Points" reads as against a specific opponent rather
	// than floating with no context beyond the date.
	const opponentTeamName: string | undefined = (() => {
		if (!selectedGame) return undefined
		const subjectsTeamId =
			subjectTeamId ??
			players.find((player) => player.id === subjectPlayerId)?.currentTeam?.id
		if (subjectsTeamId === selectedGame.homeTeam.id) {
			return selectedGame.awayTeam.name
		}
		if (subjectsTeamId === selectedGame.awayTeam.id) {
			return selectedGame.homeTeam.name
		}
		return undefined
	})()

	const titlePreview = buildTitlePreview({
		shape,
		options,
		statAggregation,
		awardVerb,
		awardConferences,
		awardDivisions,
		awardName,
		eventClause,
		picksRequired,
		ouLine,
		selectedGame,
		selectedPlayerName,
		selectedTeamName,
		subjectName,
		opponentTeamName,
		statName,
		isRateStat,
		hasCatalogStat: !!selectedStat,
		offersStatAggregation,
	})

	const title = form.useWatch("title")
	// Once the creator types into the title field directly, stop overwriting
	// it as titlePreview keeps recomputing from the fields above - it's theirs
	// now. Before that, keep it synced live so the field always shows the
	// current best-guess title rather than going stale the moment any other
	// field changes.
	useEffect(() => {
		if (titleEdited) return
		if (titlePreview !== null && titlePreview !== title) {
			form.setValue("title", titlePreview)
		}
	}, [titlePreview, titleEdited, title, form])

	return (
		<FormProvider form={form}>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="6" alignItems="stretch">
					<Section label="What kind of call is this?" required>
						<QuestionTypePicker
							value={hasSelectedType ? shape : null}
							onChange={selectType}
							isAdmin={isAdmin}
						/>
					</Section>

					{hasSelectedType && (
						<>
							{(isAnyOU ||
								isPlayerNumeric ||
								isTeamNumeric ||
								isTeamSeasonNumeric) && (
								<Section label={isAnyOU ? "The number" : "The stat"} required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												{!isPlayerSeasonOU &&
													!isTeamSeasonOU &&
													!isTeamSeasonNumeric && (
														<GameField
															leagueId={leagueId}
															selectedGame={selectedGame}
															required
														/>
													)}
												{leagueId ? (
													<>
														<StatPicker
															stats={stats.filter(
																(s) =>
																	s.appliesTo === "BOTH" ||
																	s.appliesTo ===
																		(isPlayerStatOU ||
																		isPlayerSeasonOU ||
																		isPlayerNumeric
																			? "PLAYER"
																			: "TEAM"),
															)}
															catalogOnly={
																isPlayerNumeric ||
																isTeamNumeric ||
																isTeamSeasonNumeric
															}
														/>
														{isAnyOU && (
															<div className={css({ width: "64" })}>
																<form.Field name="ouLine">
																	{(field) => (
																		<TextInput
																			error={field.meta.error ?? undefined}
																			description="Can't be a whole number - the result has to be able to land on one side or the other, never exactly on it."
																		>
																			<TextInput.Label required>
																				Number
																			</TextInput.Label>
																			<TextInput.Group>
																				<TextInput.Field
																					type="number"
																					// "any", not a fixed 0.5 - a rate-stat line
																					// (batting average, ERA) needs finer-grained
																					// decimals than a counting-stat one.
																					step="any"
																					placeholder="224.5"
																					aria-required
																					value={field.value ?? ""}
																					onChange={(e) =>
																						field.onChange(
																							e.target.value === ""
																								? undefined
																								: Number(e.target.value),
																						)
																					}
																					onBlur={field.onBlur}
																				/>
																			</TextInput.Group>
																		</TextInput>
																	)}
																</form.Field>
															</div>
														)}
														{(isPlayerSeasonOU || isTeamSeasonOU) && (
															<ChipField
																name="statAggregation"
																label="Total or per game"
																required
																options={[
																	["total", "Total"],
																	["per_game", "Per game"],
																]}
															/>
														)}
														{(isPlayerStatOU ||
															isTeamStatOU ||
															isPlayerSeasonOU ||
															isTeamSeasonOU ||
															isPlayerNumeric ||
															isTeamNumeric ||
															isTeamSeasonNumeric) && (
															<SubjectPicker
																teams={scopedTeams}
																players={scopedPlayers}
																kind={
																	isPlayerStatOU ||
																	isPlayerSeasonOU ||
																	isPlayerNumeric
																		? "player"
																		: "team"
																}
																required
															/>
														)}
													</>
												) : (
													<FieldHint>
														Pick a league above to choose the stat{" "}
														{isAnyOU ? "and subject" : "and subject"} - both
														pull from that league's catalog.
													</FieldHint>
												)}
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isPlayerVsPlayer && (
								<Section label="The comparison" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												<OptionList
													items={scopedPlayers.map((player) => ({
														id: player.id,
														label: player.name,
														kind: "player" as const,
														meta: player.currentTeam?.abbreviation,
													}))}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
													exactCount={2}
													rowLabels={["Player A", "Player B"]}
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Both from this game - teammates or opponents, either
													works.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isPlayerVsPlayerSeason && (
								<Section label="The comparison" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												<ChipField
													name="statAggregation"
													label="Total or per game"
													required
													options={[
														["total", "Total"],
														["per_game", "Per game"],
													]}
												/>
												<OptionList
													items={players.map((player) => ({
														id: player.id,
														label: player.name,
														kind: "player" as const,
														meta: player.currentTeam?.abbreviation,
													}))}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
													exactCount={2}
													rowLabels={["Player A", "Player B"]}
												/>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isTeamVsTeamSeason && (
								<Section label="The comparison" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" || s.appliesTo === "TEAM",
													)}
												/>
												<ChipField
													name="statAggregation"
													label="Total or per game"
													required
													options={[
														["total", "Total"],
														["per_game", "Per game"],
													]}
												/>
												<OptionList
													items={teams.map((team) => ({
														id: team.id,
														label: team.name,
														kind: "team" as const,
														meta: team.abbreviation,
													}))}
													rowPlaceholder="Team name"
													addLabel="+ Add team"
													exactCount={2}
													rowLabels={["Team A", "Team B"]}
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Season-long, no game attached - any two teams in the
													league, division rivals or not.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isTeamVsTeam && (
								<Section label="The matchup" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													The two options are the game's own home and away teams
													- nothing to configure once a game's picked.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isGameStatLeader && (
								<Section label="The stat leader" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
													required
												/>
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
													catalogOnly
												/>
												{gameStatLeaderPoolItems === null ? (
													<FieldHint>Pick a game to see the pool.</FieldHint>
												) : (
													<PoolSummary
														items={gameStatLeaderPoolItems}
														scopeLabel={
															selectedGame
																? `${selectedGame.awayTeam.name} @ ${selectedGame.homeTeam.name}`
																: ""
														}
													/>
												)}
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													The pool is both teams' rosters - nothing to curate
													once a game's picked.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isSeasonStatLeader && (
								<Section label="The stat leader" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<StatPicker
													stats={stats.filter(
														(s) =>
															s.appliesTo === "BOTH" ||
															s.appliesTo === "PLAYER",
													)}
												/>
												{offersStatAggregation && (
													<ChipField
														name="statAggregation"
														label="Total or per game"
														required
														options={[
															["total", "Total"],
															["per_game", "Per game"],
														]}
													/>
												)}
												<OptionList
													items={seasonStatLeaderItems}
													rowPlaceholder="Player name"
													addLabel="+ Add player"
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Season-long, no game attached - name the players
													yourself, three or more. Off-catalog stats are allowed
													here, so advanced metrics work. For just two, use
													Player Season Head-to-Head instead.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isYesNo && (
								<Section label="The proposition" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<GameField
													leagueId={leagueId}
													selectedGame={selectedGame}
												/>
												<form.Field name="eventClause">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description={
																'What follows "Will {subject}…" - e.g. "signs a contract extension by March 1."'
															}
														>
															<TextInput.Label required>
																What's being predicted
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	placeholder="records a triple-double tonight"
																	aria-required
																	value={field.value}
																	onChange={field.onChange}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</form.Field>
												<SubjectPicker
													teams={scopedTeams}
													players={scopedPlayers}
													kind="either"
												/>
												<p
													className={css({
														fontSize: "xs",
														color: "fg.subtle",
													})}
												>
													Fixed at exactly two options - nothing else to
													configure.
												</p>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isAnyAward && (
								<Section label="The award" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<HStack gap="3.5">
													<div className={css({ flex: "1" })}>
														<form.Field name="awardConferences">
															{(field) => (
																<VStack gap="1.5" alignItems="stretch">
																	<FieldLabel>Conference</FieldLabel>
																	<MultiSelect
																		value={field.value}
																		onValueChange={field.onChange}
																	>
																		<MultiSelect.Trigger>
																			{multiSelectSummary(
																				field.value,
																				"Whole league",
																			)}
																		</MultiSelect.Trigger>
																		<MultiSelect.Content>
																			{conferenceOptions.map((conference) => (
																				<MultiSelect.Option
																					key={conference}
																					value={conference}
																				>
																					{conference}
																				</MultiSelect.Option>
																			))}
																		</MultiSelect.Content>
																	</MultiSelect>
																</VStack>
															)}
														</form.Field>
													</div>
													<div className={css({ flex: "1" })}>
														<form.Field name="awardDivisions">
															{(field) => (
																<VStack gap="1.5" alignItems="stretch">
																	<FieldLabel>Division</FieldLabel>
																	<MultiSelect
																		value={field.value}
																		onValueChange={field.onChange}
																	>
																		<MultiSelect.Trigger>
																			{multiSelectSummary(
																				field.value,
																				awardConferences.length
																					? "Whole conference"
																					: "Pick a conference first",
																			)}
																		</MultiSelect.Trigger>
																		<MultiSelect.Content>
																			{divisionOptions.map((division) => (
																				<MultiSelect.Option
																					key={division}
																					value={division}
																				>
																					{division}
																				</MultiSelect.Option>
																			))}
																		</MultiSelect.Content>
																	</MultiSelect>
																</VStack>
															)}
														</form.Field>
													</div>
												</HStack>
												{isPlayerAward && (
													<form.Field name="awardPositions">
														{(field) => (
															<VStack gap="1.5" alignItems="stretch">
																<FieldLabel>Position</FieldLabel>
																<MultiSelect
																	value={field.value}
																	onValueChange={field.onChange}
																>
																	<MultiSelect.Trigger>
																		{multiSelectSummary(
																			field.value,
																			"Every position",
																		)}
																	</MultiSelect.Trigger>
																	<MultiSelect.Content>
																		{positionOptions.map((position) => (
																			<MultiSelect.Option
																				key={position}
																				value={position}
																			>
																				{position}
																			</MultiSelect.Option>
																		))}
																	</MultiSelect.Content>
																</MultiSelect>
															</VStack>
														)}
													</form.Field>
												)}
												{isPlayerAward && (
													<form.Field name="awardSeasonsInLeague">
														{(field) => (
															<VStack gap="1.5" alignItems="stretch">
																<FieldLabel>Years in the league</FieldLabel>
																<MultiSelect
																	value={field.value.map(String)}
																	onValueChange={(next) =>
																		field.onChange(next.map(Number))
																	}
																>
																	<MultiSelect.Trigger>
																		{multiSelectSummary(
																			field.value.map(String),
																			"Any experience",
																		)}
																	</MultiSelect.Trigger>
																	<MultiSelect.Content>
																		{yearsInLeagueOptions.map((years) => (
																			<MultiSelect.Option
																				key={years}
																				value={String(years)}
																			>
																				{yearsInLeagueLabel(years)}
																			</MultiSelect.Option>
																		))}
																	</MultiSelect.Content>
																</MultiSelect>
																<FieldHint>
																	Pick one or more exact years - e.g. "Rookie
																	(0)" for Rookie of the Year.
																</FieldHint>
															</VStack>
														)}
													</form.Field>
												)}
												{isPlayerAward && (
													<form.Field name="awardRookieOnly">
														{(field) => (
															<HStack
																justify="space-between"
																alignItems="center"
																gap="4"
															>
																<VStack gap="0.5" alignItems="flex-start">
																	<span
																		className={css({
																			fontSize: "sm",
																			fontWeight: "semibold",
																		})}
																	>
																		Rookie of the Year only
																	</span>
																	<span
																		className={css({
																			fontSize: "xs",
																			color: "fg.subtle",
																		})}
																	>
																		Narrows the pool to players who are actually
																		rookie-eligible this season, per this
																		sport's own real rule - not just "Years in
																		the league" = 0.
																	</span>
																</VStack>
																<button
																	type="button"
																	role="switch"
																	aria-checked={field.value}
																	aria-label="Rookie of the Year only"
																	onClick={() => {
																		const next = !field.value
																		field.onChange(next)
																		// Flipping this on always means the award is
																		// Rookie of the Year - only backfill the name
																		// when it's still blank so it doesn't clobber
																		// something the admin already typed (e.g. a
																		// per-position variant).
																		if (next && !awardName) {
																			form.setValue(
																				"awardName",
																				"Rookie of the Year",
																			)
																		}
																	}}
																	className={cx(
																		css({
																			position: "relative",
																			width: "42px",
																			height: "24px",
																			flexShrink: 0,
																			borderRadius: "full",
																			bg: "bg.subtle",
																			border: "1px solid",
																			borderColor: "border.default",
																			transition:
																				"background-color 0.15s ease, border-color 0.15s ease",
																			_after: {
																				content: '""',
																				position: "absolute",
																				top: "1px",
																				left: "1px",
																				width: "18px",
																				height: "18px",
																				borderRadius: "full",
																				bg: "fg.subtle",
																				transition:
																					"transform 0.15s ease, background-color 0.15s ease",
																			},
																		}),
																		field.value &&
																			css({
																				bg: "primary.subtle",
																				borderColor: "primary.default",
																				_after: {
																					transform: "translateX(18px)",
																					bg: "primary.default",
																				},
																			}),
																	)}
																/>
															</HStack>
														)}
													</form.Field>
												)}
												<form.Field name="awardName">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description={`The award's real name, e.g. "MVP" or "Rookie of the Year."`}
														>
															<TextInput.Label required>
																Award name
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	placeholder="MVP"
																	aria-required
																	value={field.value}
																	onChange={field.onChange}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</form.Field>
												<ChipField
													name="awardVerb"
													label="Win or be"
													required
													hint={`"Win" for a single-winner race (MVP). "Be" for a role or slot (an All-NBA First Team spot, a positional Gold Glove).`}
													options={[
														["win", "Win"],
														["be", "Be"],
													]}
												/>
												<div className={css({ width: "64" })}>
													<form.Field name="picksRequired">
														{(field) => (
															<TextInput
																error={field.meta.error ?? undefined}
																description="1 for a single-winner award (MVP). Higher for a fixed-size group award (an All-NBA team)."
															>
																<TextInput.Label required>
																	Winners
																</TextInput.Label>
																<TextInput.Group>
																	<TextInput.Field
																		type="number"
																		aria-required
																		min={1}
																		max={15}
																		value={field.value ?? ""}
																		onChange={(e) =>
																			field.onChange(
																				e.target.value === ""
																					? undefined
																					: Number(e.target.value),
																			)
																		}
																		onBlur={field.onBlur}
																	/>
																</TextInput.Group>
															</TextInput>
														)}
													</form.Field>
												</div>
												{awardPoolItems === null ? (
													<FieldHint>Pick a league to see the pool.</FieldHint>
												) : (
													<PoolSummary
														items={awardPoolItems}
														scopeLabel={[
															awardConferences.join("/"),
															awardDivisions.join("/"),
															awardPositions.join("/"),
															awardSeasonsInLeague
																.map(yearsInLeagueLabel)
																.join("/"),
														]
															.filter(Boolean)
															.join(" ")}
														rookieOnly={awardRookieOnly}
													/>
												)}
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isFinalists && (
								<Section label="The award" required>
									<Card>
										<Card.Body>
											<VStack gap="3.5" alignItems="stretch">
												<LeagueField sports={sports} />
												<form.Field name="awardName">
													{(field) => (
														<TextInput
															error={field.meta.error ?? undefined}
															description={`The award's real name, e.g. "Defensive Player of the Year."`}
														>
															<TextInput.Label required>
																Award name
															</TextInput.Label>
															<TextInput.Group>
																<TextInput.Field
																	placeholder="Defensive Player of the Year"
																	aria-required
																	value={field.value}
																	onChange={field.onChange}
																	onBlur={field.onBlur}
																/>
															</TextInput.Group>
														</TextInput>
													)}
												</form.Field>
												<OptionList
													items={finalistItems}
													rowPlaceholder="Finalist name"
													addLabel="+ Add finalist"
												/>
											</VStack>
										</Card.Body>
									</Card>
								</Section>
							)}

							{titlePreview !== null && (
								<Section label="Title">
									<Card>
										<Card.Body>
											<form.Field name="title">
												{(field) => (
													<TextInput
														error={field.meta.error ?? undefined}
														description="Prefilled from the fields above - edit it if the generated phrasing reads awkwardly."
													>
														<TextInput.Label required>Title</TextInput.Label>
														<TextInput.Group>
															<TextInput.Field
																value={field.value}
																onChange={(e) => {
																	setTitleEdited(true)
																	field.onChange(e)
																}}
																onBlur={field.onBlur}
															/>
														</TextInput.Group>
													</TextInput>
												)}
											</form.Field>
										</Card.Body>
									</Card>
								</Section>
							)}

							<Section label="Resolution" required>
								<Card>
									<Card.Body>
										<ResolutionFields leagueId={leagueId} />
									</Card.Body>
								</Card>
							</Section>

							{isAdmin && (
								<Section label="Visibility">
									<Card>
										<Card.Body>
											<form.Field name="isOfficial">
												{(field) => (
													<OfficialToggle
														checked={!!field.value}
														onChange={(checked) => field.onChange(checked)}
														disabled={isAdminOnlyShape || !!ballotId}
													/>
												)}
											</form.Field>
										</Card.Body>
									</Card>
								</Section>
							)}

							{isAdmin && (
								<Section label="Ballot">
									<Card>
										<Card.Body>
											<BallotField
												leagueId={leagueId}
												lockedBallotId={lockedBallotId}
											/>
										</Card.Body>
									</Card>
								</Section>
							)}

							<form.Subscribe selector={(s) => s.meta}>
								{(meta) => (
									<VStack gap="2" alignItems="stretch">
										<Button
											type="submit"
											variant="solid"
											size="lg"
											fullWidth
											loading={meta.isSubmitting}
											disabled={meta.isSubmitting || !meta.canSubmit}
										>
											Publish Question
										</Button>
										<FormError message={meta.formError} />
									</VStack>
								)}
							</form.Subscribe>
						</>
					)}
				</VStack>
			</form>
		</FormProvider>
	)
}
