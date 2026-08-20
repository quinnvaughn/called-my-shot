import { useLazyQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import { Button, button } from "#/components/ui/button"
import { QuestionDetailDocument } from "#/graphql/queries/question"
import { openModal } from "#/stores/modal-store"
import { AdminResolveModal } from "./admin-resolve-modal"
import { VoidQuestionModal } from "./void-question-modal"

type QuestionType =
	| "multiple_choice"
	| "yes_no"
	| "over_under"
	| "numeric_guess"
	| "multi_select"

// Loads the option pool on demand rather than requiring every caller (the
// Questions page's full list, the Queue page's needs-resolution list) to
// select it just in case a row's Resolve button gets clicked - most rows
// never do.
export function ResolveButton({
	questionId,
	onResolved,
}: {
	questionId: string
	onResolved: () => void
}) {
	const [loadQuestion] = useLazyQuery(QuestionDetailDocument)

	async function openResolve() {
		const { data } = await loadQuestion({ variables: { id: questionId } })
		if (!data?.question) return
		openModal(
			<AdminResolveModal
				question={{
					id: data.question.id,
					title: data.question.title,
					type: data.question.type.toLowerCase() as QuestionType,
					ouLine: data.question.ouLine ?? null,
					options: data.question.options,
				}}
				onResolved={onResolved}
			/>,
		)
	}

	return (
		<Button variant="outline" size="sm" onClick={openResolve}>
			Resolve
		</Button>
	)
}

export function QuestionRowActions({
	question,
	onChanged,
}: {
	question: {
		id: string
		title: string
		status: "OPEN" | "LOCKED" | "RESOLVED" | "DISPUTED"
		creator: { username: string } | null
	}
	onChanged: () => void
}) {
	if (question.status === "DISPUTED") {
		return (
			<Link
				to="/admin/disputes"
				className={button({ variant: "outline", size: "sm" })}
			>
				Review
			</Link>
		)
	}

	if (question.status === "RESOLVED") {
		return null
	}

	return (
		<HStack gap="1.5" justify="flex-end">
			<ResolveButton questionId={question.id} onResolved={onChanged} />
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					openModal(
						<VoidQuestionModal question={question} onVoided={onChanged} />,
					)
				}
			>
				Void
			</Button>
		</HStack>
	)
}
