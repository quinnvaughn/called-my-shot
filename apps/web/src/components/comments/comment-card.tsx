import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PresserMenu } from "#/components/pressers/presser-menu"
import { Identity } from "#/components/ui/identity"
import { UserHandle } from "#/components/users/user-handle"
import { useCommentActions } from "./use-comment-actions"

export type { CommentData } from "./use-comment-actions"
import type { CommentData } from "./use-comment-actions"

type Props = {
	comment: CommentData
	// What follows the sender's name: "talked trash" on a gloat.
	trailing?: string
	// The report modal's title.
	reportTitle?: string
}

// A posted comment: who sent it, their words and GIF, and a menu to report
// it or block whoever sent it.
export function CommentCard({
	comment,
	trailing,
	reportTitle = "Report this comment",
}: Props) {
	const actions = useCommentActions(comment, reportTitle)

	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				padding: "3",
				borderRadius: "lg",
				backgroundColor: "bg.subtle",
			})}
		>
			<HStack justify="space-between" gap="3">
				<UserHandle user={comment.sender}>
					<Identity
						name={comment.sender.name}
						username={comment.sender.username}
						avatarUrl={comment.sender.avatarUrl}
						trailing={trailing}
					/>
				</UserHandle>
				<PresserMenu label="Comment options" actions={actions} />
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
					{comment.text && (
						<p
							className={css({
								fontSize: "sm",
								whiteSpace: "pre-wrap",
								overflowWrap: "anywhere",
							})}
						>
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
								maxHeight: "60",
								width: "auto",
								maxWidth: "full",
								borderRadius: "md",
								alignSelf: "flex-start",
							})}
						/>
					)}
				</>
			)}
		</VStack>
	)
}
