import { useQuery } from "@tanstack/react-query"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	type CallDraft,
	CastCallForm,
	useCastCallForm,
} from "#/components/questions/cast-call-form"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import { StatContextCard } from "#/components/questions/stat-context-card/stat-context-card"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { questionStatContextQuery } from "#/graphql/questions/queries"
import { teamLabelsOf } from "#/lib/challenge"
import { CreatorCall } from "./creator-call"
import type { Entry } from "./types"

export function ChallengeStepForm({
	entry,
	creatorUsername,
	showGame,
	initial,
	isFirst,
	isLast,
	onBack,
	onSave,
}: {
	entry: Entry
	creatorUsername: string
	showGame: boolean
	initial: CallDraft | undefined
	isFirst: boolean
	isLast: boolean
	onBack: () => void
	onSave: (draft: CallDraft) => void
}) {
	const statContext = useQuery(questionStatContextQuery(entry.question.id))
	const callForm = useCastCallForm(entry.question, {
		surface: "challenge",
		formId: "challenge-step-form",
		draft: { initial, onSave },
	})

	return (
		<VStack gap="4" alignItems="stretch">
			<Card variant="surface" size="md">
				<Card.Body>
					<VStack gap="4" alignItems="stretch">
						<QuestionSummaryHeader
							question={entry.question}
							showGame={showGame}
						/>
						<CreatorCall username={creatorUsername} call={entry.creatorCall} />
					</VStack>
				</Card.Body>
			</Card>
			{/* The same numbers the question page puts above its pick form, so
			    calling here is never calling with less to go on. */}
			<StatContextCard
				statContext={statContext.data?.question?.statContext}
				trackRecord={statContext.data?.question?.viewerTrackRecord}
				teams={teamLabelsOf(entry.question.game)}
				isCallable
			/>
			<CastCallForm callForm={callForm} />
			<callForm.form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<VStack gap="2" alignItems="stretch">
						<HStack justify="space-between" gap="3">
							<Button
								variant="ghost"
								size="md"
								onClick={onBack}
								className={css({ visibility: isFirst ? "hidden" : "visible" })}
							>
								<FiChevronLeft />
								Back
							</Button>
							<Button
								type="submit"
								form={callForm.formId}
								variant="solid"
								size="md"
								disabled={!meta.canSubmit}
							>
								{isLast ? "Review my calls" : "Next"}
								<FiChevronRight />
							</Button>
						</HStack>
						<FormError message={meta.formError} />
					</VStack>
				)}
			</callForm.form.Subscribe>
		</VStack>
	)
}
