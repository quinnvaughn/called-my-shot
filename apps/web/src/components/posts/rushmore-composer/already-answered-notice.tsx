import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"

// The viewer already made this Rushmore for the chosen audience. One per
// prompt per audience, so the way forward is the one they made.
export function AlreadyAnsweredNotice({
	postId,
	audience,
}: {
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
				You already made this Rushmore for {audience}. You get one per prompt
				for everyone and one in each group. You can still change its words.
			</p>
			<Link to="/posts/$postId" params={{ postId }} className={button()}>
				View yours
			</Link>
		</VStack>
	)
}
