import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PresserMenu } from "#/components/pressers/presser-menu"
import { Avatar } from "#/components/ui/avatar"
import { UserHandle } from "#/components/users/user-handle"
import { formatTimeAgo } from "#/lib/format-date"
import { type CommentData, useCommentActions } from "./use-comment-actions"

// One message in a chat: avatar, name and time on the first line, then what
// they said. No box around it, the way chat apps run them together. The menu
// shows on hover.
export function ChatMessage({
	message,
}: {
	message: CommentData & { createdAt: string }
}) {
	const actions = useCommentActions(message)
	return (
		<HStack
			gap="3"
			alignItems="flex-start"
			className={css({
				position: "relative",
				paddingInline: "2",
				paddingBlock: "2",
				borderRadius: "md",
				_hover: { bg: "bg.subtle" },
				"& [data-message-menu]": { opacity: 0 },
				"&:hover [data-message-menu], &:focus-within [data-message-menu]": {
					opacity: 1,
				},
			})}
		>
			<UserHandle user={message.sender}>
				<Avatar
					size="sm"
					name={message.sender.name}
					src={message.sender.avatarUrl}
				/>
			</UserHandle>
			<VStack gap="1" alignItems="stretch" minWidth="0" flex="1">
				<HStack gap="2" alignItems="baseline">
					<span className={css({ fontSize: "sm" })}>
						<UserHandle user={message.sender}>{message.sender.name}</UserHandle>
					</span>
					<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
						{formatTimeAgo(message.createdAt)}
					</span>
				</HStack>
				{message.removed ? (
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
						{message.text && (
							<p
								className={css({
									fontSize: "md",
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
								})}
							>
								{message.text}
							</p>
						)}
						{message.gif && (
							<img
								src={message.gif.url}
								alt={message.gif.alt}
								width={message.gif.width}
								height={message.gif.height}
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
			<div
				data-message-menu
				className={css({ position: "absolute", top: "1", right: "1" })}
			>
				<PresserMenu label="Message options" actions={actions} />
			</div>
		</HStack>
	)
}
