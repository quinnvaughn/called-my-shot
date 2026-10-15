import { resolveQuestionSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import { ApiError } from "#/graphql/api-error"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import { ResolveQuestionDocument } from "#/graphql/questions/mutations"
import { track } from "#/lib/analytics"
import { isRateStat as computeIsRateStat } from "#/lib/field-signal"
import { useForm } from "#/lib/form/use-form"
import { toCallShape } from "#/lib/question-labels"
import { closeModal } from "#/stores/modal-store"
import { ResolveOutcomeFields } from "./resolve-outcome-fields"

export const ResolveQuestionModalFragment = graphql(`
	fragment ResolveQuestionModal_question on Question {
		id
		title
		shape
		ouLine
		numericToleranceAbsolute
		stat {
			id
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		options {
			id
			label
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

type Props = {
	question: FragmentType<typeof ResolveQuestionModalFragment>
}

export function ResolveQuestionModal({ question: questionProp }: Props) {
	const question = useFragment(ResolveQuestionModalFragment, questionProp)
	const shape = toCallShape(question.shape)
	const isMultiPick =
		shape === "player_season_award" ||
		shape === "team_season_award" ||
		shape === "player_game_stat_leader" ||
		shape === "player_season_stat_leader" ||
		shape === "player_team_season_stat_leader"
	const isRateStat = computeIsRateStat(question)
	const resolveQuestion = useGqlMutation(ResolveQuestionDocument)
	const router = useRouter()
	const queryClient = useQueryClient()

	const form = useForm({
		schema: resolveQuestionSchema,
		defaultValues: {
			shape,
			correctOptionIds: [],
			actualValue: undefined,
			resolutionNote: "",
		},
		onSubmit: async (values, helpers) => {
			const data = await resolveQuestion.mutateAsync({
				input: {
					questionId: question.id,
					correctOptionIds: values.correctOptionIds,
					actualValue: values.actualValue,
					resolutionNote: values.resolutionNote || undefined,
				},
			})
			const result = data?.resolveQuestion

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
				.with(ApiError, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "QuestionPayload" }, async () => {
					track("question_resolved", { questionId: question.id, shape })
					// Resolving settles every call on the question, which moves points,
					// records, streaks and standings on nearly every page.
					await queryClient.invalidateQueries()
					await router.invalidate()
					closeModal()
				})
				.exhaustive()
		},
	})

	const correctOptionIds = form.useWatch("correctOptionIds")

	function selectSingleCorrect(optionId: string) {
		form.setValue("correctOptionIds", [optionId])
	}

	function toggleMultiCorrect(optionId: string) {
		const current = form.values().correctOptionIds
		form.setValue(
			"correctOptionIds",
			current.includes(optionId)
				? current.filter((id) => id !== optionId)
				: [...current, optionId],
		)
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Resolve this question</Modal.Title>
			<span className={css({ fontSize: "sm", color: "fg.muted" })}>
				{question.title}
			</span>
			<span
				className={css({
					textStyle: "meta",
					color: "fg.subtle",
				})}
			>
				Publishes immediately to every caller and can't be undone - callers can
				dispute it afterward if it's wrong.
			</span>

			<form onSubmit={form.handleSubmit}>
				<VStack gap="4" alignItems="stretch">
					<form.Field name="actualValue">
						{(field) => (
							<ResolveOutcomeFields
								shape={shape}
								ouLine={question.ouLine}
								options={question.options}
								correctOptionIds={correctOptionIds}
								onToggleOption={(optionId) =>
									isMultiPick
										? toggleMultiCorrect(optionId)
										: selectSingleCorrect(optionId)
								}
								actualValue={field.value}
								onActualValueChange={field.onChange}
								actualValueError={field.meta.error ?? undefined}
								isRateStat={isRateStat}
							/>
						)}
					</form.Field>

					<form.Field name="resolutionNote">
						{(field) => (
							<Textarea error={field.meta.error ?? undefined}>
								<Textarea.Label>Note (optional)</Textarea.Label>
								<Textarea.Field
									placeholder="How you resolved this"
									maxLength={500}
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</Textarea>
						)}
					</form.Field>

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
									Publish Result
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</Modal>
	)
}
