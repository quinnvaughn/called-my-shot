import { useLazyQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import { Button, button } from "#/components/ui/button"
import { QuestionDetailDocument } from "#/graphql/queries/question"
import { openModal } from "#/stores/modal-store"
import { AdminResolveModal } from "./admin-resolve-modal"
import { DeleteQuestionModal } from "./delete-question-modal"
import { EditQuestionTitleModal } from "./edit-question-title-modal"
import { VoidQuestionModal } from "./void-question-modal"

type QuestionShape =
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
					shape: data.question.shape.toLowerCase() as QuestionShape,
					ouLine: data.question.ouLine ?? null,
					options: data.question.options,
					isRateStat:
						data.question.numericToleranceAbsolute !== null ||
						data.question.stat?.toleranceTier?.toleranceMode === "ABSOLUTE",
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
		isOfficial: boolean
		creator: { username: string } | null
	}
	onChanged: () => void
}) {
	const editTitleButton = (
		<Button
			variant="outline"
			size="sm"
			onClick={() =>
				openModal(
					<EditQuestionTitleModal question={question} onEdited={onChanged} />,
				)
			}
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
			onClick={() =>
				openModal(
					<DeleteQuestionModal question={question} onDeleted={onChanged} />,
				)
			}
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
				{editTitleButton}
				{deleteButton}
			</HStack>
		)
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
			{editTitleButton}
			{deleteButton}
		</HStack>
	)
}
