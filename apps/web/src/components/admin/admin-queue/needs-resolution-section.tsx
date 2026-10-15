import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ResolveButton } from "#/components/admin/resolve-button"
import { VoidQuestionModal } from "#/components/admin/void-question-modal"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { formatTimeAgo } from "#/lib/format-date"
import { openModal } from "#/stores/modal-store"
import { QuestionHeading } from "./question-heading"
import type { AdminQueueSummary } from "./types"

export function NeedsResolutionSection({
	questions,
}: {
	questions: AdminQueueSummary["needsResolution"]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Locked a while: likely over (estimate)
			</span>
			{questions.length === 0 ? (
				<EmptyState>Nothing needs resolving right now.</EmptyState>
			) : (
				questions.map((question) => (
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
								locked {formatTimeAgo(question.locksAt)} · {question.callCount}{" "}
								callers
							</span>
						</VStack>
						<HStack gap="1.5" flexShrink={0}>
							<ResolveButton questionId={question.id} />
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									openModal(<VoidQuestionModal question={question} />)
								}
							>
								Void
							</Button>
						</HStack>
					</HStack>
				))
			)}
		</VStack>
	)
}
