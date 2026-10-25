import { FaHeart, FaRegHeart } from "react-icons/fa"
import { css } from "styled-system/css"

type Props = {
	liked: boolean
	count: number
	onToggle: () => void
	// What's being liked, for a screen reader: "this Rushmore", "this comment".
	subject: string
	size?: "sm" | "md"
}

// A heart and how many people have liked it. Liking is what ranks a
// Rushmore or a comment under Top.
export function LikeButton({
	liked,
	count,
	onToggle,
	subject,
	size = "md",
}: Props) {
	return (
		<button
			type="button"
			aria-pressed={liked}
			aria-label={liked ? `Unlike ${subject}` : `Like ${subject}`}
			onClick={onToggle}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "1.5",
				padding: size === "sm" ? "1" : "{spacing.1.5} {spacing.2}",
				borderRadius: "md",
				textStyle: "meta",
				color: liked ? "secondary.default" : "fg.muted",
				cursor: "pointer",
				_hover: {
					bg: "fg.default/10",
					color: liked ? "secondary.default" : "fg.default",
				},
			})}
		>
			{liked ? (
				<FaHeart size={size === "sm" ? 12 : 14} aria-hidden />
			) : (
				<FaRegHeart size={size === "sm" ? 12 : 14} aria-hidden />
			)}
			{count}
		</button>
	)
}
