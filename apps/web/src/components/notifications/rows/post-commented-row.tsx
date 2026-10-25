import { FiMessageCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { postTarget } from "#/components/notifications/post-target"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const PostCommentedRowFragment = graphql(`
	fragment PostCommentedRow_notification on PostCommentedNotification {
		id
		createdAt
		lastCommenterUsername
		post {
			id
			... on RushmorePost {
				prompt {
					id
					title
				}
			}
		}
	}
`)

// Someone commented on the viewer's post - see sendPostComment.
export function PostCommentedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof PostCommentedRowFragment>>) {
	const n = useFragment(PostCommentedRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiMessageCircle}
			target={postTarget(n.post)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.lastCommenterUsername ?? "someone"}</b> commented on your
				Rushmore
			</p>
			{n.post?.prompt && (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					{n.post.prompt.title}
				</p>
			)}
		</NotificationShell>
	)
}
