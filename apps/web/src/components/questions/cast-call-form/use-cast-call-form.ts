import { castCallSchema } from "@called-my-shot/schemas"
import {
	toleranceBand as computeToleranceBand,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { createElement, useMemo, useRef, useState } from "react"
import { match } from "ts-pattern"
import { FirstCallDoneModal } from "#/components/onboarding/first-call-done-modal"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import { CastCallDocument, RedoCallDocument } from "#/graphql/mutations/calls"
import { type CallSurface, questionHorizon, track } from "#/lib/analytics"
import { isRateStat as computeIsRateStat } from "#/lib/field-signal"
import { useForm } from "#/lib/form/use-form"
import { closeModal, openModal } from "#/stores/modal-store"
import { consumeRanFirstCallTour } from "#/stores/tour-store"

export const CastCallFormFragment = graphql(`
	fragment CastCallForm_question on Question {
		id
		shape
		locksAt
		ouLine
		numericTolerancePct
		numericToleranceAbsolute
		lossRate
		picksRequired
		callCount
		isOfficial
		# Named in the walkthrough's closing modal, which tells a first-time
		# caller where the result is going to come from.
		resolutionSource
		seasonGamesPlayed
		seasonTotalGames
		averageGuess
		guessDistribution {
			value
			count
		}
		stat {
			id
			name
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		customStat
		league {
			id
			seasonFormat {
				gamesPerSeason
			}
		}
		sport {
			id
		}
		options {
			id
			label
			fieldPct
			callCount
			lossRate
			team {
				...Team_team @unmask
			}
			player {
				id
				name
				headshotUrl
			}
		}
	}
`)

export const FORM_ID = "cast-call-form"

export type QuestionCallShape =
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "player_season_stat_over_under"
	| "team_season_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "team_season_stat_numeric_guess"
	| "player_vs_player"
	| "player_vs_player_season"
	| "team_vs_team"
	| "team_vs_team_season"
	| "player_game_stat_leader"
	| "player_season_stat_leader"
	| "player_team_season_stat_leader"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"

// Which cast-call layout a shape renders as - a much smaller axis than the
// full shape list, since casting only cares about the pick mechanic
// (one numeric guess, exactly one option, or several options), not what the
// question is actually about. player_season_award/team_season_award only
// need the "multi" layout (picks list, shared/split conviction toggle) when
// picksRequired is actually >1 - a single-winner award ("MVP", picksRequired
// 1) is mechanically the exact same "pick one from a list" as every other
// single-pick shape, and OptionFields already handles a large option pool
// via its own search field, so it gets that layout instead rather than a
// "1/1 picks"-style UI built for picking several things at once.
export type CastCallBucket = "single" | "multi" | "numeric"
export function castCallBucketFor(
	shape: QuestionCallShape,
	picksRequired: number,
): CastCallBucket {
	return match(shape)
		.with(
			"player_stat_numeric_guess",
			"team_stat_numeric_guess",
			"team_season_stat_numeric_guess",
			() => "numeric" as const,
		)
		.with("player_season_award", "team_season_award", () =>
			picksRequired > 1 ? ("multi" as const) : ("single" as const),
		)
		.with(
			"player_stat_over_under",
			"team_stat_over_under",
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"game_total_over_under",
			"player_vs_player",
			"player_vs_player_season",
			"team_vs_team",
			"team_vs_team_season",
			"player_game_stat_leader",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			"yes_no_prop",
			"player_award_finalists",
			() => "single" as const,
		)
		.exhaustive()
}

// A question's over/under-family shapes all show the option label with the
// line appended ("Over 224.5") - every other shape's option label already
// says everything it needs to on its own.
export function isOverUnderShape(shape: QuestionCallShape): boolean {
	return (
		shape === "player_stat_over_under" ||
		shape === "team_stat_over_under" ||
		shape === "player_season_stat_over_under" ||
		shape === "team_season_stat_over_under" ||
		shape === "game_total_over_under"
	)
}

// The shapes where options are a pool of candidates/nominees rather than a
// small fixed framing (Over/Under, Yes/No, Team A vs Team B) - those other
// shapes want their two options in the order the question poses them, not
// reordered by votes. A nominee pool has no such fixed framing (including
// player_game_stat_leader's server-derived both-rosters pool, and
// player_season_stat_leader's curated one, whose order is just the sequence
// the creator happened to add names in), so OptionPickerList defaults it to
// popularity instead of creation order (see its own comment) to surface the
// obvious picks before someone's made one.
export function isAwardShape(shape: QuestionCallShape): boolean {
	return (
		shape === "player_season_award" ||
		shape === "team_season_award" ||
		shape === "player_award_finalists" ||
		shape === "player_game_stat_leader" ||
		shape === "player_season_stat_leader" ||
		shape === "player_team_season_stat_leader"
	)
}

// What a redo needs that a first call doesn't: which call is being replaced,
// and what it currently says so the form opens on the existing pick rather
// than blank. Everything else - validation, the per-shape controls, error
// mapping - is identical, which is the reason this is a mode on the same hook
// instead of a second form that would drift from it.
export type RedoMode = {
	callId: string
	current: {
		caseText: string | null
		guessValue: number | null
		conviction: number | null
		selections: { optionId: string; conviction: number }[]
	}
}

// A fade: a new call aimed at an existing one, on the other side from it. The
// pick is fixed to that side, so the form opens with it already selected.
export type FadeMode = {
	callId: string
	optionId: string
}

export type CastCallFormOptions = {
	// Where the call is being made, for analytics.
	surface: CallSurface
	redo?: RedoMode
	fade?: FadeMode
	onCalled?: () => void
}

// All of the state behind making a call, decoupled from where it renders.
// The route ($questionId.tsx) calls this once and hands the result to both
// <CastCallForm> (the fields) and <CallSubmitBar> (the sticky review
// button), which need to render as siblings at the top level of the page -
// not nested one inside the other - so the submit bar has a tall enough
// containing block for `position: sticky` to actually work. `questionProp`
// is nullable because the route calls this unconditionally (hooks can't be
// called after an early return); nothing here does anything visible unless
// a real question - and therefore a mounted CastCallForm/CallSubmitBar - exists.
//
// Passing `redo` switches it to replacing an existing call instead of making
// a new one. Passing `fade` makes a new call that fades another. `onCalled`
// runs once a new call has landed, the page has refreshed and the confirm
// modal has closed.
export function useCastCallForm(
	questionProp: FragmentType<typeof CastCallFormFragment> | null | undefined,
	{ surface, redo, fade, onCalled }: CastCallFormOptions,
) {
	const question = useFragment(CastCallFormFragment, questionProp)
	const shape = (question?.shape.toLowerCase() ??
		"yes_no_prop") as QuestionCallShape
	// See isRateStat's own comment in #/lib/field-signal.ts - the single
	// shared source for this check, not re-derived here.
	const isRateStat = question != null && computeIsRateStat(question)
	const bucket = castCallBucketFor(shape, question?.picksRequired ?? 1)
	const castCall = useGqlMutation(CastCallDocument)
	const redoCall = useGqlMutation(RedoCallDocument)
	const router = useRouter()
	const queryClient = useQueryClient()

	// Only single-pick shapes use this - conviction on the one-and-only
	// selection they can make. player_season_award/team_season_award track
	// conviction per pick directly in form state instead (each pick's own
	// slider), and the numeric-guess shapes use the schema's own top-level
	// `conviction` field.
	const [singleSelectConviction, setSingleSelectConviction] = useState(50)

	// Lets ConfirmCallModal send the viewer back to the case textarea when
	// they open the confirm step without having written one - mirrors the
	// mockup's "+ add a case before locking in" button, which closes the
	// modal then scrolls/focuses the field it left behind. Deferred to a
	// frame after closeModal() rather than called inline: <Modal> restores
	// focus to whatever was focused before it opened as part of its own
	// unmount cleanup, which runs after this click handler returns and would
	// otherwise steal focus straight back off the textarea.
	const caseTextRef = useRef<HTMLTextAreaElement>(null)
	function focusCaseText() {
		requestAnimationFrame(() => {
			caseTextRef.current?.scrollIntoView({
				block: "center",
				behavior: "smooth",
			})
			caseTextRef.current?.focus()
		})
	}

	// player_season_award/team_season_award only. The pool can run into the
	// dozens (a full league roster), so unlike the single-pick shapes this
	// isn't a list of clickable rows - it's search-to-add, same pattern
	// EntitySearchField already provides for create-question's option/pool
	// pickers, just searching this question's fixed options instead of an
	// open team/player catalog.
	const [multiSelectSearch, setMultiSelectSearch] = useState("")
	const [convictionMode, setConvictionMode] = useState<"shared" | "split">(
		"shared",
	)
	const [sharedConviction, setSharedConviction] = useState(50)

	// The numeric-guess shapes only - how far the stepper's +/- buttons move
	// the guess per click. Typing directly into the field always takes the
	// exact value regardless of which step size is selected here. A rate stat
	// (batting average, ERA) starts on a small decimal step instead of the
	// whole-number default a counting stat uses.
	const [guessStep, setGuessStep] = useState(isRateStat ? 0.01 : 1)

	// A win-total guess ("Wins", statName check matches the one
	// generateQuestionTitle uses for the same "is this actually a win total"
	// question - see packages/schemas/src/question-title.ts) starting from 0
	// means clicking "+" up to 40+ times before landing anywhere plausible.
	// The season's own halfway point is a far better starting guess, same
	// spirit as falling back to the crowd's averageGuess below once real
	// guesses exist - this just covers the gap before any do.
	const isWinTotalGuess = question?.stat?.name === "Wins"
	const gamesPerSeason = question?.league?.seasonFormat?.gamesPerSeason ?? null

	// castCallSchema itself only requires player_season_award/
	// team_season_award to have >=1 pick - the comment on its own branch for
	// those shapes is explicit that the exact count is "checked against the
	// question's picksRequired in the resolver, which is the only place that
	// number is known" server-side. But the client does know it too, from
	// this same fragment (picksRequired above), so canSubmit can enforce the
	// real count instead of going quiet past 1 pick and only failing once the
	// server round-trips a ValidationError back.
	const picksRequired = question?.picksRequired ?? null
	const schema = useMemo(() => {
		if (picksRequired == null) return castCallSchema
		return castCallSchema.superRefine((data, ctx) => {
			if (
				(data.shape === "player_season_award" ||
					data.shape === "team_season_award") &&
				data.selections.length !== picksRequired
			) {
				ctx.addIssue({
					code: "custom",
					path: ["selections"],
					message: `Pick exactly ${picksRequired} - you picked ${data.selections.length}`,
				})
			}
		})
	}, [picksRequired])

	const form = useForm({
		schema,
		defaultValues: {
			shape,
			questionId: question?.id ?? "",
			caseText: redo?.current.caseText ?? "",
			// The field's current average when there's enough data to have one -
			// starting the stepper wherever the crowd already sits is a far more
			// useful default than an arbitrary constant, and it's already computed
			// server-side for the distribution chart. Before any real guesses
			// exist, a win-total question starts at the season's halfway point
			// instead of 0 (see isWinTotalGuess above) - everything else still
			// falls back to 0. Either way this needs to be a real number, not
			// undefined - the stepper's +/- buttons need something to increment
			// from the moment it mounts, and an empty control with no visible
			// value reads as broken rather than "not yet answered".
			//
			// A redo opens on what the call already says, so "I stand by the
			// reasoning, I'm changing the pick" is one edit rather than a
			// retype of everything.
			guessValue:
				redo?.current.guessValue ??
				(question?.averageGuess != null
					? isRateStat
						? Math.round(question.averageGuess * 1000) / 1000
						: Math.round(question.averageGuess)
					: isWinTotalGuess && gamesPerSeason != null
						? Math.round(gamesPerSeason / 2)
						: 0),
			conviction: redo?.current.conviction ?? 50,
			selections:
				redo?.current.selections ??
				(fade ? [{ optionId: fade.optionId, conviction: 50 }] : []),
		},
		onSubmit: async (values, helpers) => {
			const selections = values.selections.map((s) => ({
				optionId: s.optionId,
				conviction: s.conviction,
			}))
			// The two mutations take the same picks; a redo is keyed on the
			// call it replaces rather than on the question, which the server
			// derives from it.
			const result = redo
				? (
						await redoCall.mutateAsync({
							input: {
								callId: redo.callId,
								caseText: values.caseText || undefined,
								guessValue: values.guessValue,
								conviction: values.conviction,
								selections,
							},
						})
					)?.redoCall
				: (
						await castCall.mutateAsync({
							input: {
								questionId: values.questionId,
								caseText: values.caseText || undefined,
								guessValue: values.guessValue,
								conviction: values.conviction,
								selections,
								fadesCallId: fade?.callId,
							},
						})
					)?.castCall

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
					helpers.setFormError("You need to sign in to make a call.")
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "CastCallPayload" }, async () => {
					const convictions = values.selections.length
						? values.selections.map((s) => s.conviction)
						: [values.conviction ?? 0]
					if (question) {
						track("call_submitted", {
							questionId: values.questionId,
							questionShape: shape,
							leagueId: question.league.id,
							sportId: question.sport.id,
							horizon: questionHorizon(shape),
							locksAt: question.locksAt,
							pickCount: values.selections.length || 1,
							hasCase: values.caseText.length > 0,
							avgConviction:
								convictions.reduce((sum, c) => sum + c, 0) / convictions.length,
							surface,
						})
					}

					// This page is the destination - refresh in place rather than
					// navigating away, so the pending banner/locked calls list pick
					// up the new viewerCall immediately.
					await queryClient.invalidateQueries()
					await router.invalidate()
					closeModal()
					onCalled?.()

					// Closes out the walkthrough on the call it was built
					// around. Asks the tour store rather than the ?tour param,
					// which the tour clears as soon as it ends - well before
					// the user gets around to actually submitting.
					if (question && consumeRanFirstCallTour()) {
						track("onboarding_completed", {})
						// createElement rather than JSX: this hook is a .ts file.
						openModal(
							createElement(FirstCallDoneModal, {
								resolutionSource: question.resolutionSource,
							}),
						)
					}
				})
				.with({ __typename: "RedoCallPayload" }, async () => {
					// No call_submitted here - a redo isn't a new call, and
					// counting it as one would double-count the same pick in
					// every funnel that starts at call_submitted. The spend is
					// tracked server-side as redo_spent, which is where the
					// wallet and timing facts are.
					await queryClient.invalidateQueries()
					await router.invalidate()
					closeModal()
				})
				.with({ __typename: "AuthorizationError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.exhaustive()
		},
	})

	const selections = form.useWatch("selections")
	const guessValue = form.useWatch("guessValue")

	function selectSingle(optionId: string) {
		form.setValue("selections", [
			{ optionId, conviction: singleSelectConviction },
		])
	}

	function addMultiSelectPick(optionId: string) {
		const current = form.values().selections
		if (current.some((s) => s.optionId === optionId)) return
		if (
			question?.picksRequired != null &&
			current.length >= question.picksRequired
		) {
			return
		}
		form.setValue("selections", [
			...current,
			{ optionId, conviction: sharedConviction },
		])
	}

	function removeMultiSelectPick(optionId: string) {
		form.setValue(
			"selections",
			form.values().selections.filter((s) => s.optionId !== optionId),
		)
	}

	// Collapsing back to shared applies one level to every existing pick
	// again, same as the split->shared transition in the multiselect
	// mockup's own JS - otherwise switching modes would silently leave
	// whatever per-pick values were set in split mode in place, even though
	// the UI no longer shows them as independent.
	function setSharedMode() {
		setConvictionMode("shared")
		form.setValue(
			"selections",
			form
				.values()
				.selections.map((s) => ({ ...s, conviction: sharedConviction })),
		)
	}

	function updateSharedConviction(v: number) {
		setSharedConviction(v)
		form.setValue(
			"selections",
			form.values().selections.map((s) => ({ ...s, conviction: v })),
		)
	}

	const toleranceSpec: ToleranceSpec | null =
		question?.numericToleranceAbsolute != null
			? { mode: "absolute", amount: question.numericToleranceAbsolute }
			: question?.numericTolerancePct != null
				? { mode: "percentage", pct: question.numericTolerancePct }
				: null
	const toleranceBand =
		toleranceSpec != null && guessValue != null
			? computeToleranceBand(guessValue, toleranceSpec)
			: null

	// "Rebounds", "Passing Yards" - the stat this question is actually asking
	// about, shown under the guess input so the number has units. stat is the
	// catalog-backed default; customStat is the freeform escape hatch used
	// when a question isn't about a stat in the catalog. Never both.
	const guessUnit = question?.stat?.name ?? question?.customStat ?? null

	return {
		question,
		shape,
		bucket,
		form,
		selections,
		guessValue,
		toleranceBand,
		isRateStat,
		guessUnit,
		guessBuckets: question?.guessDistribution ?? [],
		averageGuess: question?.averageGuess ?? null,
		singleSelectConviction,
		setSingleSelectConviction,
		multiSelectSearch,
		setMultiSelectSearch,
		convictionMode,
		setSharedMode,
		setConvictionMode,
		sharedConviction,
		updateSharedConviction,
		selectSingle,
		addMultiSelectPick,
		removeMultiSelectPick,
		caseTextRef,
		focusCaseText,
		guessStep,
		setGuessStep,
	}
}

export type CastCallFormState = ReturnType<typeof useCastCallForm>
