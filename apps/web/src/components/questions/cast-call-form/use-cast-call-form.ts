import { useMutation, useQuery } from "@apollo/client/react"
import { castCallSchema } from "@called-my-shot/schemas"
import { toleranceBand as computeToleranceBand } from "@called-my-shot/scoring"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { match } from "ts-pattern"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CastCallDocument } from "#/graphql/mutations/calls"
import {
	PlayersByLeagueDocument,
	TeamsByLeagueDocument,
} from "#/graphql/queries/sports"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"

export const CastCallFormFragment = graphql(`
	fragment CastCallForm_question on Question {
		id
		type
		ouLine
		numericTolerancePct
		picksRequired
		callCount
		optionsOpenField
		openFieldKind
		averageGuess
		guessDistribution {
			value
			count
		}
		stat {
			id
			name
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

export type QuestionCallType =
	| "multiple_choice"
	| "yes_no"
	| "over_under"
	| "numeric_guess"
	| "multi_select"

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
	const type = (question?.type.toLowerCase() ??
		"multiple_choice") as QuestionCallType
	const [castCall] = useMutation(CastCallDocument)
	const router = useRouter()

	// Only single-select types use this - conviction on the one-and-only
	// selection they can make. multi_select tracks conviction per pick
	// directly in form state instead (each pick's own slider), and
	// numeric_guess uses the schema's own top-level `conviction` field.
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
			caseTextRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
			caseTextRef.current?.focus()
		})
	}

	// multi_select only. The pool can run into the dozens (an All-NBA ballot,
	// a championship field), so unlike the other option-based types this
	// isn't a list of clickable rows - it's search-to-add, same pattern
	// EntitySearchField already provides for create-question's option/pool
	// pickers, just searching this question's fixed options instead of an
	// open team/player catalog.
	const [multiSelectSearch, setMultiSelectSearch] = useState("")
	const [convictionMode, setConvictionMode] = useState<"shared" | "split">(
		"shared",
	)
	const [sharedConviction, setSharedConviction] = useState(50)

	// multiple_choice on an optionsOpenField question only - search-to-add
	// against the real league catalog rather than this question's own (maybe
	// still empty) option pool, since the whole point is picking someone not
	// in it yet.
	const [openFieldSearch, setOpenFieldSearch] = useState("")

	// numeric_guess only - how far the stepper's +/- buttons move the guess
	// per click. Typing directly into the field always takes the exact value
	// regardless of which step size is selected here.
	const [guessStep, setGuessStep] = useState(1)

	// castCallSchema itself only requires multi_select to have >=1 pick - the
	// comment on its own multi_select branch is explicit that the exact count
	// is "checked against the question's picksRequired in the resolver, which
	// is the only place that number is known" server-side. But the client
	// does know it too, from this same fragment (picksRequired above), so
	// canSubmit can enforce the real count instead of going quiet past 1 pick
	// and only failing once the server round-trips a ValidationError back.
	const picksRequired = question?.picksRequired ?? null
	const schema = useMemo(() => {
		if (picksRequired == null) return castCallSchema
		return castCallSchema.superRefine((data, ctx) => {
			if (
				data.type === "multi_select" &&
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
			type,
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
				question?.averageGuess != null ? Math.round(question.averageGuess) : 0,
			conviction: 50,
			selections: [],
			newOption: undefined,
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
						newOption: values.newOption
							? {
									label: values.newOption.label,
									teamId: values.newOption.teamId,
									playerId: values.newOption.playerId,
									conviction: values.newOption.conviction,
								}
							: undefined,
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
	const newOption = form.useWatch("newOption")
	const guessValue = form.useWatch("guessValue")

	// multiple_choice on an optionsOpenField question only - the catalog a
	// pick not yet in the pool gets searched against. Scoped to the question's
	// own league, same as create-question's option/subject pickers.
	const isOpenField = type === "multiple_choice" && !!question?.optionsOpenField
	const openFieldLeagueId = question?.league.id
	const { data: openFieldTeamsData } = useQuery(TeamsByLeagueDocument, {
		variables: { leagueId: openFieldLeagueId },
		skip:
			!isOpenField || question?.openFieldKind !== "TEAM" || !openFieldLeagueId,
	})
	const { data: openFieldPlayersData } = useQuery(PlayersByLeagueDocument, {
		variables: { leagueId: openFieldLeagueId },
		skip:
			!isOpenField ||
			question?.openFieldKind !== "PLAYER" ||
			!openFieldLeagueId,
	})
	const openFieldCatalogItems: EntitySearchItem[] =
		question?.openFieldKind === "TEAM"
			? (openFieldTeamsData?.teams ?? []).map((team) => ({
					id: team.id,
					label: team.name,
					kind: "team" as const,
					meta: team.abbreviation,
				}))
			: (openFieldPlayersData?.players ?? []).map((player) => ({
					id: player.id,
					label: player.name,
					kind: "player" as const,
					meta: player.currentTeam?.abbreviation,
				}))

	function selectSingle(optionId: string) {
		form.setValue("newOption", undefined)
		form.setValue("selections", [
			{ optionId, conviction: singleSelectConviction },
		])
	}

	// A catalog item with no existing option on this question yet - resolves
	// through castCall's newOption instead of an optionId it doesn't have.
	function selectNewOption(item: EntitySearchItem) {
		form.setValue("selections", [])
		form.setValue("newOption", {
			label: item.label,
			teamId: item.kind === "team" ? item.id : undefined,
			playerId: item.kind === "player" ? item.id : undefined,
			conviction: singleSelectConviction,
		})
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

	const toleranceBand =
		question?.numericTolerancePct != null && guessValue != null
			? computeToleranceBand(guessValue, question.numericTolerancePct)
			: null

	// "Rebounds", "Passing Yards" - the stat this question is actually asking
	// about, shown under the guess input so the number has units. stat is the
	// catalog-backed default; customStat is the freeform escape hatch used
	// when a question isn't about a stat in the catalog. Never both.
	const guessUnit = question?.stat?.name ?? question?.customStat ?? null

	return {
		question,
		type,
		form,
		selections,
		newOption,
		guessValue,
		toleranceBand,
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
		isOpenField,
		openFieldSearch,
		setOpenFieldSearch,
		openFieldCatalogItems,
		selectNewOption,
		caseTextRef,
		focusCaseText,
		guessStep,
		setGuessStep,
	}
}

export type CastCallFormState = ReturnType<typeof useCastCallForm>
