import { FiHeart } from "react-icons/fi"
import { css } from "styled-system/css"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { postTarget } from "#/components/notifications/post-target"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const LikesMilestoneRowFragment = graphql(`
	fragment LikesMilestoneRow_notification on LikesMilestoneNotification {
		id
		createdAt
		likeCount
		comment {
			id
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

// The viewer's post, or their comment on one, reached a likes milestone -
// see lib/likes.ts in the API. A comment's opens the thread; a post's opens
// the post.
export function LikesMilestoneRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof LikesMilestoneRowFragment>>) {
	const n = useFragment(LikesMilestoneRowFragment, notification)
	const target = n.comment
		? postTarget(n.post)
		: n.post
			? { to: "/posts/$postId" as const, params: { postId: n.post.id } }
			: null
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiHeart}
			target={target}
			onOpen={onOpen}
		>
			<p className={text}>
				Your {n.comment ? "comment" : "Rushmore"} hit <b>{n.likeCount} likes</b>
			</p>
			{n.post?.prompt && (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					{n.post.prompt.title}
				</p>
			)}
		</NotificationShell>
	)
}
