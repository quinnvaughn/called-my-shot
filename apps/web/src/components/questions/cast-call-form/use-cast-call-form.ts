import { useMutation } from "@apollo/client/react"
import { castCallSchema } from "@called-my-shot/schemas"
import {
	toleranceBand as computeToleranceBand,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { match } from "ts-pattern"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CastCallDocument } from "#/graphql/mutations/calls"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

export const CastCallFormFragment = graphql(`
	fragment CastCallForm_question on Question {
		id
		shape
		ouLine
		numericTolerancePct
		numericToleranceAbsolute
		picksRequired
		callCount
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
			}
		}
		customStat
		league {
			id
		}
		options {
			id
			label
			fieldPct
			callCount
			team {
				id
			}
			player {
				id
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
	| "player_vs_player"
	| "player_vs_player_season"
	| "team_vs_team"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"

// Which cast-call layout a shape renders as - a much smaller axis than the
// 11 shapes themselves, since casting only cares about the pick mechanic
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

// The three shapes where options are a pool of candidates/nominees rather
// than a small fixed framing (Over/Under, Yes/No, Team A vs Team B) - those
// other shapes want their two options in the order the question poses them,
// not reordered by votes. A nominee pool has no such fixed framing, so
// OptionPickerList defaults it to popularity instead of creation order (see
// its own comment) to surface the obvious picks before someone's made one.
export function isAwardShape(shape: QuestionCallShape): boolean {
	return (
		shape === "player_season_award" ||
		shape === "team_season_award" ||
		shape === "player_award_finalists"
	)
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
export function useCastCallForm(
	questionProp: FragmentType<typeof CastCallFormFragment> | null | undefined,
) {
	const question = useFragment(CastCallFormFragment, questionProp)
	const shape = (question?.shape.toLowerCase() ??
		"yes_no_prop") as QuestionCallShape
	// True for a rate stat (batting average, ERA) - see ToleranceSpec in
	// @called-my-shot/scoring. numericToleranceAbsolute is only ever set for
	// the two numeric_guess shapes (drives whether the guess input/stepper
	// below work in whole numbers or decimals); an over/under shape has no
	// tolerance snapshot at all, so it falls back to the picked stat's own
	// tolerance tier mode instead - same signal, different source depending
	// on shape.
	const isRateStat =
		question?.numericToleranceAbsolute != null ||
		question?.stat?.toleranceTier?.toleranceMode === "ABSOLUTE"
	const bucket = castCallBucketFor(shape, question?.picksRequired ?? 1)
	const [castCall] = useMutation(CastCallDocument)
	const router = useRouter()

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
			caseText: "",
			// The field's current average when there's enough data to have one -
			// starting the stepper wherever the crowd already sits is a far more
			// useful default than an arbitrary constant, and it's already computed
			// server-side for the distribution chart. Falls back to 0 on a
			// question with no guesses yet. Either way this needs to be a real
			// number, not undefined - the stepper's +/- buttons need something to
			// increment from the moment it mounts, and an empty control with no
			// visible value reads as broken rather than "not yet answered".
			guessValue:
				question?.averageGuess != null
					? isRateStat
						? Math.round(question.averageGuess * 1000) / 1000
						: Math.round(question.averageGuess)
					: 0,
			conviction: 50,
			selections: [],
		},
		onSubmit: async (values, helpers) => {
			const { data } = await castCall({
				variables: {
					input: {
						questionId: values.questionId,
						caseText: values.caseText || undefined,
						guessValue: values.guessValue,
						conviction: values.conviction,
						selections: values.selections.map((s) => ({
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					},
				},
			})
			const result = data?.castCall

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
					// This page is the destination - refresh in place rather than
					// navigating away, so the pending banner/locked calls list pick
					// up the new viewerCall immediately.
					await router.invalidate()
					closeModal()
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
