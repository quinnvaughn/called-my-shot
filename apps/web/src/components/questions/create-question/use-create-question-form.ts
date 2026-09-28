import { createQuestionSchema, isAdminOnlyShape } from "@called-my-shot/schemas"
import { isSeasonLongShape } from "@called-my-shot/scoring"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { match } from "ts-pattern"
import { useGqlMutation } from "#/graphql/hooks"
import { CreateQuestionDocument } from "#/graphql/mutations/questions"
import { track } from "#/lib/analytics"
import { isRateToleranceTier } from "#/lib/field-signal"
import { useForm } from "#/lib/form/use-form"
import { buildTitlePreview } from "./build-title-preview"
import { toCreateQuestionInput } from "./to-create-question-input"
import { useEntityPools } from "./use-entity-pools"
import { useQuestionCatalog } from "./use-question-catalog"

/**
 * Owns the create-question form: its state, its submit, and every value
 * derived from what's filled in so far.
 *
 * Effect order matters only in that it's preserved from when all of this lived
 * in one component - the ballot/official effect, then the catalog's two
 * stale-pick prunes, then the aggregation cleanup, then the title sync. They
 * write disjoint paths, so nothing here actually depends on that order.
 */
export function useCreateQuestionForm() {
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
				input: toCreateQuestionInput(values),
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

	const {
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
	} = useQuestionCatalog({
		form,
		sportId,
		leagueId,
		gameId,
		subjectTeamId,
		subjectPlayerId,
		awardConferences,
		awardDivisions,
	})

	const isGameStatLeader = shape === "player_game_stat_leader"
	const isSeasonStatLeader = shape === "player_season_stat_leader"
	const isTeamSeasonStatLeader = shape === "player_team_season_stat_leader"
	const isPlayerAward = shape === "player_season_award"
	const isTeamAward = shape === "team_season_award"
	const isFinalists = shape === "player_award_finalists"
	const isAdminOnly = isAdminOnlyShape(shape)

	const {
		awardPoolItems,
		gameStatLeaderPoolItems,
		teamStatLeaderPoolItems,
		finalistItems,
		seasonStatLeaderItems,
	} = useEntityPools({
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
	})

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
		// The season-long shapes never take a game at all (that's the whole
		// reason they're separate shapes from their game-scoped counterparts) -
		// no panel renders a GameField for them, so a stale gameId from whatever
		// was previously selected has to be cleared here instead of riding along
		// invisibly. It isn't cosmetic: the API derives locksAt from the game
		// row whenever gameId is set (see create-question.ts), so a season-long
		// award carrying a leftover game would lock at that single game's
		// tip-off rather than the date the admin chose, with the field disabled
		// and showing the game's time.
		//
		// isSeasonLongShape rather than a list written out here: the shapes with
		// no game picker are exactly that set, so this can't drift from what the
		// panels actually render. An earlier hand-written list here had already
		// missed all three award shapes.
		//
		// Every other shape switch still carries a picked game forward as a
		// convenience (e.g. team_vs_team to game_total_over_under for that same
		// matchup).
		if (isSeasonLongShape(next)) {
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
		if (isAdminOnlyShape(next)) {
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

	return {
		form,
		shape,
		leagueId,
		ballotId,
		hasSelectedType,
		selectType,
		setTitleEdited,
		titlePreview,
		isAdminOnlyShape: isAdminOnly,
		// Everything the shape panels read, shaped to go straight into
		// QuestionDataProvider - see data-context.tsx for why none of it is a
		// watched form scalar.
		data: {
			teams,
			players,
			stats,
			selectedGame,
			scopedTeams,
			scopedPlayers,
			conferenceOptions,
			divisionOptions,
			positionOptions,
			yearsInLeagueOptions,
			awardPoolItems,
			gameStatLeaderPoolItems,
			teamStatLeaderPoolItems,
			finalistItems,
			seasonStatLeaderItems,
			offersStatAggregation,
		},
	}
}
