import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useCommentActions } from "#/components/comments/use-comment-actions"
import { PresserMenu } from "#/components/pressers/presser-menu"
import { Avatar } from "#/components/ui/avatar"
import { UserHandle } from "#/components/users/user-handle"
import { formatTimeAgo } from "#/lib/format-date"
import { LikeButton } from "../like-button"
import { useCommentLike } from "../use-comment-like"
import type { CommentFields } from "./types"

type Props = {
	comment: CommentFields
	// Absent where the viewer can't comment, which hides Reply.
	onReply?: () => void
	size?: "md" | "sm"
}

// One comment or reply: who said it and when, who it answers, what they
// said, and its like, Reply and report/block menu.
export function CommentRow({ comment, onReply, size = "md" }: Props) {
	const actions = useCommentActions(comment)
	const like = useCommentLike(comment)

	return (
		<HStack gap="3" alignItems="flex-start">
			<UserHandle user={comment.sender}>
				<Avatar
					size={size === "sm" ? "xs" : "sm"}
					name={comment.sender.name}
					src={comment.sender.avatarUrl}
				/>
			</UserHandle>
			<VStack gap="1" alignItems="stretch" minWidth="0" flex="1">
				<HStack gap="2" alignItems="center" flexWrap="wrap">
					<span className={css({ fontSize: "sm" })}>
						<UserHandle user={comment.sender}>{comment.sender.name}</UserHandle>
					</span>
					<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
						{formatTimeAgo(comment.createdAt)}
					</span>
				</HStack>
				{comment.removed ? (
					<p
						className={css({
							fontSize: "sm",
							color: "fg.subtle",
							fontStyle: "italic",
						})}
					>
						Removed by moderators
					</p>
				) : (
					<>
						{(comment.text || comment.replyTo) && (
							<p
								className={css({
									fontSize: "sm",
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
								})}
							>
								{comment.replyTo && (
									<span className={css({ color: "secondary.default" })}>
										<UserHandle user={comment.replyTo} />{" "}
									</span>
								)}
								{comment.text}
							</p>
						)}
						{comment.gif && (
							<img
								src={comment.gif.url}
								alt={comment.gif.alt}
								width={comment.gif.width}
								height={comment.gif.height}
								loading="lazy"
								className={css({
									maxHeight: "64",
									width: "auto",
									maxWidth: "full",
									borderRadius: "md",
									alignSelf: "flex-start",
								})}
							/>
						)}
					</>
				)}
				{!comment.removed && (
					<HStack gap="1" marginInlineStart="-1.5">
						<LikeButton
							liked={like.liked}
							count={like.count}
							onToggle={like.toggle}
							subject={`@${comment.sender.username}'s comment`}
							size="sm"
						/>
						{onReply && (
							<button
								type="button"
								onClick={onReply}
								className={css({
									padding: "{spacing.1} {spacing.2}",
									borderRadius: "md",
									textStyle: "meta",
									color: "fg.muted",
									cursor: "pointer",
									_hover: { bg: "fg.default/10", color: "fg.default" },
								})}
							>
								Reply
							</button>
						)}
						<PresserMenu label="Comment options" actions={actions} />
					</HStack>
				)}
			</VStack>
		</HStack>
	)
}
