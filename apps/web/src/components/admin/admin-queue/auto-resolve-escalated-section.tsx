import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { MarkVoidedModal } from "#/components/admin/mark-voided-modal"
import { ResolveButton } from "#/components/admin/resolve-button"
import { Button } from "#/components/ui/button"
import type { AutoResolveFailure } from "#/graphql/generated/graphql"
import { openModal } from "#/stores/modal-store"
import { QuestionHeading } from "./question-heading"
import type { AdminQueueSummary } from "./types"

// Why the automatic resolver handed a question over - see autoResolveFailure
// in the API.
const AUTO_RESOLVE_FAILURE_LABELS: Record<AutoResolveFailure, string> = {
	FETCH_FAILED: "ESPN requests kept failing",
	BOX_SCORE_NOT_FINAL: "Box score never went final",
	MISSING_EXTERNAL_REF: "Not linked to ESPN",
	SUBJECT_NOT_IN_BOX_SCORE: "Not in ESPN's numbers",
	STAT_UNDEFINED: "Stat has no value",
	TIE: "Tie",
	PUSH: "Landed exactly on the line",
	LEADER_NOT_IN_POOL: "Leader isn't an option",
	NO_LEADER: "Nobody recorded the stat",
	UNMAPPED: "Stat doesn't settle automatically",
	RECHECK_DISAGREED: "Re-check couldn't confirm the result",
}

export function AutoResolveEscalatedSection({
	escalated,
}: {
	escalated: AdminQueueSummary["autoResolveEscalated"]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Couldn't resolve automatically
			</span>
			{escalated.map(({ question, failureReason, failureDetail }) => (
				<HStack
					key={question.id}
					justify="space-between"
					gap="4"
					className={css({
						bg: "bg.surface",
						border: "1px solid {colors.border.default}",
						borderRadius: "xl",
						padding: "3.5",
					})}
				>
					<VStack
						gap="1"
						alignItems="flex-start"
						className={css({ minWidth: 0 })}
					>
						<QuestionHeading question={question} />
						<span
							className={css({
								textStyle: "meta",
								color: "danger.default",
							})}
						>
							{failureReason
								? AUTO_RESOLVE_FAILURE_LABELS[failureReason]
								: "Game never went final"}
							{failureDetail && ` · ${failureDetail}`}
						</span>
					</VStack>
					<HStack gap="1.5" flexShrink={0}>
						<ResolveButton questionId={question.id} />
						<Button
							variant="outline"
							size="sm"
							onClick={() => openModal(<MarkVoidedModal question={question} />)}
						>
							No result
						</Button>
					</HStack>
				</HStack>
			))}
		</VStack>
	)
}
