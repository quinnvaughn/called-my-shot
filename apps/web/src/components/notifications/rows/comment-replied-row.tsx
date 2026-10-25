import { FiCornerDownRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { postTarget } from "#/components/notifications/post-target"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { text } from "./styles"
import type { RowProps } from "./types"

export const CommentRepliedRowFragment = graphql(`
	fragment CommentRepliedRow_notification on CommentRepliedNotification {
		id
		createdAt
		lastReplierUsername
		comment {
			id
			sender {
				id
			}
		}
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

// Someone replied under the viewer's comment, or @mentioned them in a reply
// under someone else's - see sendPostComment.
export function CommentRepliedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof CommentRepliedRowFragment>>) {
	const n = useFragment(CommentRepliedRowFragment, notification)
	const me = useMe()
	const onTheirComment = !!me && n.comment?.sender.id === me.id
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiCornerDownRight}
			target={postTarget(n.post)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.lastReplierUsername ?? "someone"}</b>{" "}
				{onTheirComment ? "replied to your comment" : "replied to you"}
			</p>
			{n.post?.prompt && (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					On {n.post.prompt.title}
				</p>
			)}
		</NotificationShell>
	)
}
