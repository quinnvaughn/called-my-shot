import { useMutation } from "@apollo/client/react"
import { adminResolveQuestionSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { ResolveOutcomeFields } from "#/components/questions/resolve-outcome-fields"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import { OverturnDisputeDocument } from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

type QuestionForResolve = {
	id: string
	title: string
	shape:
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
	ouLine: number | null
	options: { id: string; label: string }[]
}

export function OverturnDisputeModal({
	disputeId,
	question,
	onOverturned,
}: {
	disputeId: string
	question: QuestionForResolve
	onOverturned: () => void
}) {
	const [overturnDispute] = useMutation(OverturnDisputeDocument)
	const [correctOptionIds, setCorrectOptionIds] = useState<string[]>([])
	const [actualValue, setActualValue] = useState<number | undefined>()
	const [resolutionNote, setResolutionNote] = useState("")
	const [resolutionSource, setResolutionSource] = useState("")
	const [resolutionSourceUrl, setResolutionSourceUrl] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)
	const [fieldError, setFieldError] = useState<string | null>(null)

	function toggleOption(optionId: string) {
		if (
			question.shape === "player_season_award" ||
			question.shape === "team_season_award"
		) {
			setCorrectOptionIds((prev) =>
				prev.includes(optionId)
					? prev.filter((id) => id !== optionId)
					: [...prev, optionId],
			)
		} else {
			setCorrectOptionIds([optionId])
		}
	}

	async function handleSubmit() {
		setFormError(null)
		setFieldError(null)

		const parsed = adminResolveQuestionSchema.safeParse({
			shape: question.shape,
			correctOptionIds,
			actualValue,
			resolutionNote,
			resolutionSource: resolutionSource || undefined,
			resolutionSourceUrl: resolutionSourceUrl || undefined,
		})
		if (!parsed.success) {
			setFieldError(
				parsed.error.issues[0]?.message ?? "Check the outcome and try again.",
			)
			return
		}

		setSubmitting(true)
		try {
			const { data } = await overturnDispute({
				variables: {
					input: {
						disputeId,
						resolution: {
							questionId: question.id,
							correctOptionIds,
							actualValue,
							resolutionNote: resolutionNote || undefined,
							resolutionSource: resolutionSource || undefined,
							resolutionSourceUrl: resolutionSourceUrl || undefined,
						},
					},
				},
			})
			const result = data?.overturnDispute
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					setFieldError(
						r.fieldErrors?.[0]?.message ?? "Check the outcome and try again.",
					)
				})
				.with({ __typename: "AuthenticationError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "AuthorizationError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "QuestionPayload" }, async () => {
					closeModal()
					onOverturned()
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Overturn resolution</Modal.Title>
			<span className={css({ fontSize: "sm", color: "fg.muted" })}>
				{question.title}
			</span>
			<p
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
				})}
			>
				Sets a new outcome and closes this dispute as overturned. Points
				recalculate for every caller.
			</p>
			<VStack gap="4" alignItems="stretch">
				<ResolveOutcomeFields
					shape={question.shape}
					ouLine={question.ouLine}
					options={question.options}
					correctOptionIds={correctOptionIds}
					onToggleOption={toggleOption}
					actualValue={actualValue}
					onActualValueChange={setActualValue}
				/>

				<TextInput>
					<TextInput.Label>Resolution source</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							placeholder="e.g. corrected ESPN box score"
							value={resolutionSource}
							onChange={(e) => setResolutionSource(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>
				<TextInput>
					<TextInput.Label>Source URL (optional)</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							placeholder="https://…"
							value={resolutionSourceUrl}
							onChange={(e) => setResolutionSourceUrl(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>

				<Textarea>
					<Textarea.Label>Note (shown to callers)</Textarea.Label>
					<Textarea.Field
						placeholder="Worth explaining why this changed"
						maxLength={500}
						value={resolutionNote}
						onChange={(e) => setResolutionNote(e.target.value)}
					/>
				</Textarea>

				<FormError message={formError ?? fieldError} />

				<Button
					variant="solid"
					size="lg"
					fullWidth
					loading={submitting}
					disabled={submitting}
					onClick={handleSubmit}
				>
					Overturn &amp; Publish
				</Button>
			</VStack>
		</Modal>
	)
}
