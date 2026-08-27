import { useMutation, useQuery } from "@apollo/client/react"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { AttachQuestionToSlateDocument } from "#/graphql/mutations/slates"
import { SlateAttachableQuestionsDocument } from "#/graphql/queries/slates"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { questionShapeLabel } from "#/lib/question-labels"
import { closeModal } from "#/stores/modal-store"

type Props = {
	slateId: string
	leagueId: string
	onAttached: () => void
}

// A question attached here needs a label too (required, same as one created
// straight into the slate) - collected inline per row rather than a second
// step, since there's exactly one field to fill in.
export function AttachQuestionModal({ slateId, leagueId, onAttached }: Props) {
	const [search, setSearch] = useState("")
	const debouncedSearch = useDebouncedValue(search, 300)
	const { data, loading } = useQuery(SlateAttachableQuestionsDocument, {
		variables: { leagueId, search: debouncedSearch || undefined },
	})
	const [attach, { error: mutationError }] = useMutation(
		AttachQuestionToSlateDocument,
	)
	const [labels, setLabels] = useState<Record<string, string>>({})
	const [attachingId, setAttachingId] = useState<string | null>(null)
	const [rowError, setRowError] = useState<string | null>(null)

	const questions =
		data?.adminQuestions.__typename === "QueryAdminQuestionsSuccess"
			? data.adminQuestions.data.items
			: []

	async function handleAttach(questionId: string) {
		const label = (labels[questionId] ?? "").trim()
		if (!label) {
			setRowError("Give it a label first")
			return
		}
		setRowError(null)
		setAttachingId(questionId)
		const { data } = await attach({
			variables: { input: { slateId, questionId, label } },
		})
		setAttachingId(null)
		const result = data?.attachQuestionToSlate
		if (result?.__typename === "SlateQuestionPayload") {
			onAttached()
		} else if (result?.__typename === "ValidationError") {
			setRowError(
				result.fieldErrors?.[0]?.message ?? "Couldn't attach that question",
			)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>Attach existing question</Modal.Title>
				<Modal.Description>
					Only questions in this slate's league that aren't already in another
					slate show up here.
				</Modal.Description>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<TextInput>
					<TextInput.Group>
						<TextInput.Field
							placeholder="Search questions…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>
				{!loading && questions.length === 0 && (
					<p className={css({ fontSize: "sm", color: "fg.subtle" })}>
						Nothing available to attach.
					</p>
				)}
				<VStack gap="2" alignItems="stretch" maxHeight="80" overflowY="auto">
					{questions.map((question) => (
						<VStack
							key={question.id}
							gap="2"
							alignItems="stretch"
							className={css({
								border: "1px solid {colors.border.default}",
								borderRadius: "lg",
								padding: "3",
							})}
						>
							<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
								{question.title}
							</span>
							<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
								{questionShapeLabel[question.shape]}
							</span>
							<TextInput>
								<TextInput.Group>
									<TextInput.Field
										placeholder="Label (e.g. First base)"
										value={labels[question.id] ?? ""}
										onChange={(e) =>
											setLabels((prev) => ({
												...prev,
												[question.id]: e.target.value,
											}))
										}
									/>
								</TextInput.Group>
							</TextInput>
							<Button
								variant="outline"
								size="sm"
								loading={attachingId === question.id}
								onClick={() => handleAttach(question.id)}
							>
								Attach
							</Button>
						</VStack>
					))}
				</VStack>
				<FormError message={rowError ?? mutationError?.message ?? null} />
				<Button variant="ghost" size="sm" onClick={closeModal}>
					Done
				</Button>
			</VStack>
		</Modal>
	)
}
