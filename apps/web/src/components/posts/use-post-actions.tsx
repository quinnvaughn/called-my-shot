import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { ReportContentModal } from "#/components/moderation/report-content-modal"
import type { PresserMenuAction } from "#/components/pressers/presser-menu"
import { ConfirmActionModal } from "#/components/ui/confirm-action-modal"
import type { PresserReportReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	DeletePostDocument,
	invalidatePosts,
	postErrorMessage,
	ReportPostDocument,
} from "#/graphql/posts/mutations"
import {
	BlockUserDocument,
	invalidateAfterBlock,
} from "#/graphql/pressers/mutations"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"

type Post = {
	id: string
	removed: boolean
	viewerIsAuthor: boolean
	author: { id: string; username: string }
}

// The post's menu. The author can change the words or delete it; anyone
// else signed in can report it or block whoever posted it.
export function usePostActions(
	post: Post,
	onEdit: () => void,
): PresserMenuAction[] {
	const me = useMe()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const report = useGqlMutation(ReportPostDocument)
	const remove = useGqlMutation(DeletePostDocument)
	const block = useGqlMutation(BlockUserDocument)

	if (!me || post.removed) return []

	if (post.viewerIsAuthor) {
		return [
			{ label: "Edit words", onSelect: onEdit },
			{
				label: "Delete",
				danger: true,
				onSelect: () =>
					openModal(
						<ConfirmActionModal
							title="Delete this Rushmore?"
							confirmLabel="Delete"
							danger
							onConfirm={async () => {
								const result = (await remove.mutateAsync({ postId: post.id }))
									?.deletePost
								if (result?.__typename !== "DeletePostPayload") {
									return postErrorMessage(result)
								}
								await invalidatePosts(queryClient)
								void navigate({ to: "/" })
								return null
							}}
						>
							Its likes and comments go with it. You can make a new one for this
							prompt afterward.
						</ConfirmActionModal>,
					),
			},
		]
	}

	return [
		{
			label: "Report",
			onSelect: () =>
				openModal(
					<ReportContentModal
						title="Report this Rushmore"
						submit={async ({ reason, details }) => {
							const result = (
								await report.mutateAsync({
									input: {
										postId: post.id,
										reason: reason.toUpperCase() as PresserReportReason,
										details: details || undefined,
									},
								})
							)?.reportPost
							if (result?.__typename === "PostReportPayload") return null
							return postErrorMessage(result)
						}}
					/>,
				),
		},
		{
			label: `Block @${post.author.username}`,
			danger: true,
			onSelect: async () => {
				await block.mutateAsync({ username: post.author.username })
				await invalidateAfterBlock(queryClient)
				void navigate({ to: "/" })
			},
		},
	]
}
