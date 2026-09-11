import { FaXTwitter } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

type Props = {
	text: string
	url: string
	onClick: () => void
}

export function PostOnXLink({ text, url, onClick }: Props) {
	// x.com/intent/post rather than twitter.com/intent/tweet: the old host
	// still 302s, but that adds a hop to the path a share takes. text and url
	// stay separate params so X joins them itself and doesn't count the url
	// against the character budget.
	const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(
		text,
	)}&url=${encodeURIComponent(url)}`

	return (
		<a
			href={intentUrl}
			// A real navigation to x.com, not a popup this app should try to
			// manage.
			target="_blank"
			rel="noopener noreferrer"
			onClick={onClick}
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "2",
				paddingBlock: "2.5",
				borderRadius: "md",
				border: "1px solid {colors.border.default}",
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.default",
				textDecoration: "none",
				cursor: "pointer",
				transition: "background-color 0.15s ease",
				_hover: { backgroundColor: "bg.subtle" },
			})}
		>
			<HStack gap="2" alignItems="center">
				<FaXTwitter size={14} />
				Post on X
			</HStack>
		</a>
	)
}
