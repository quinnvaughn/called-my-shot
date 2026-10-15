import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import { Button, button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { DeleteQuestionModal } from "./delete-question-modal"
import { EditQuestionTitleModal } from "./edit-question-title-modal"
import { MarkVoidedModal } from "./mark-voided-modal"
import { ResolveButton } from "./resolve-button"
import { VoidQuestionModal } from "./void-question-modal"

export function QuestionRowActions({
	question,
}: {
	question: {
		id: string
		title: string
		status: "OPEN" | "LOCKED" | "RESOLVED" | "DISPUTED" | "VOIDED"
		isOfficial: boolean
		creator: { username: string } | null
	}
}) {
	// Settles the question with no result and keeps it, unlike Void, which
	// deletes it.
	const noResultButton = (
		<Button
			variant="outline"
			size="sm"
			onClick={() => openModal(<MarkVoidedModal question={question} />)}
		>
			No result
		</Button>
	)

	const editTitleButton = (
		<Button
			variant="outline"
			size="sm"
			onClick={() => openModal(<EditQuestionTitleModal question={question} />)}
		>
			Edit title
		</Button>
	)

	// Only official questions can be hard-deleted - a user-generated question
	// goes through Void instead, which preserves the asker's audit trail and
	// strike bookkeeping (see deleteQuestion's own isOfficial check).
	const deleteButton = question.isOfficial ? (
		<Button
			variant="outline"
			size="sm"
			onClick={() => openModal(<DeleteQuestionModal question={question} />)}
		>
			Delete
		</Button>
	) : null

	if (question.status === "DISPUTED") {
		return (
			<HStack gap="1.5" justify="flex-end">
				{editTitleButton}
				<Link
					to="/admin/disputes"
					className={button({ variant: "outline", size: "sm" })}
				>
					Review
				</Link>
			</HStack>
		)
	}

	if (question.status === "RESOLVED") {
		return (
			<HStack gap="1.5" justify="flex-end">
				{noResultButton}
				{editTitleButton}
				{deleteButton}
			</HStack>
		)
	}

	// Resolving a voided question gives it a result after all.
	if (question.status === "VOIDED") {
		return (
			<HStack gap="1.5" justify="flex-end">
				<ResolveButton questionId={question.id} />
				{editTitleButton}
				{deleteButton}
			</HStack>
		)
	}

	return (
		<HStack gap="1.5" justify="flex-end">
			<ResolveButton questionId={question.id} />
			<Button
				variant="outline"
				size="sm"
				onClick={() => openModal(<VoidQuestionModal question={question} />)}
			>
				Void
			</Button>
			{question.status === "LOCKED" && noResultButton}
			{editTitleButton}
			{deleteButton}
		</HStack>
	)
}
