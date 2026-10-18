import { useQueryClient } from "@tanstack/react-query"
import { ReportContentModal } from "#/components/moderation/report-content-modal"
import type { PresserMenuAction } from "#/components/pressers/presser-menu"
import { ReportCommentDocument } from "#/graphql/comments/mutations"
import type { PresserReportReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	BlockUserDocument,
	invalidateAfterBlock,
} from "#/graphql/pressers/mutations"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"

export type CommentData = {
	id: string
	removed: boolean
	text: string | null
	gif: {
		url: string
		width: number
		height: number
		alt: string
	} | null
	sender: {
		id: string
		username: string
		name: string
		avatarUrl: string | null
	}
}

// What the viewer can do about someone else's comment: report it, or block
// whoever sent it. Nothing on their own, or on one already taken down.
export function useCommentActions(
	comment: CommentData,
	reportTitle = "Report this comment",
): PresserMenuAction[] {
	const me = useMe()
	const report = useGqlMutation(ReportCommentDocument)
	const block = useGqlMutation(BlockUserDocument)
	const queryClient = useQueryClient()

	const actions: PresserMenuAction[] =
		!me || me.id === comment.sender.id || comment.removed
			? []
			: [
					{
						label: "Report",
						onSelect: () =>
							openModal(
								<ReportContentModal
									title={reportTitle}
									submit={async ({ reason, details }) => {
										const result = (
											await report.mutateAsync({
												input: {
													commentId: comment.id,
													reason: reason.toUpperCase() as PresserReportReason,
													details: details || undefined,
												},
											})
										)?.reportComment
										if (result?.__typename === "CommentReportPayload")
											return null
										return result?.__typename === "ValidationError"
											? (result.fieldErrors[0]?.message ?? result.message)
											: (result?.message ?? "Something went wrong. Try again.")
									}}
								/>,
							),
					},
					{
						label: `Block @${comment.sender.username}`,
						danger: true,
						onSelect: async () => {
							await block.mutateAsync({ username: comment.sender.username })
							await invalidateAfterBlock(queryClient)
						},
					},
				]

	return actions
}
