import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import type { PostKind } from "#/lib/post-kind"

// The viewer already made this one for the chosen audience. One per prompt
// per audience, so the way forward is the one they made.
export function AlreadyAnsweredNotice({
	kind,
	postId,
	audience,
}: {
	kind: PostKind
	postId: string
	// "Everyone", or the group's name.
	audience: string
}) {
	return (
		<VStack
			gap="3"
			alignItems="flex-start"
			className={css({
				padding: "4",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				bg: "bg.subtle",
			})}
		>
			<p className={css({ fontSize: "sm" })}>
				{kind === "redraft"
					? `You already redrafted this class for ${audience}. You get one redraft per class for everyone and one in each group. You can still change its words.`
					: `You already made this Rushmore for ${audience}. You get one per prompt for everyone and one in each group. You can still change its words.`}
			</p>
			<Link to="/posts/$postId" params={{ postId }} className={button()}>
				View yours
			</Link>
		</VStack>
	)
}
