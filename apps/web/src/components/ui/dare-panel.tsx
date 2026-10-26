import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

// The push to send something to friends: a big line they'd want to argue
// with or beat, why the link lets them, and the buttons that send it. Used
// under a finished arcade game and on the author's own post.
export function DarePanel({
	dare,
	why,
	children,
}: {
	// "Can your friends beat 5 guesses?", "Only 6% of people put Dirk
	// Nowitzki on theirs."
	dare: string
	// What the link does for whoever opens it.
	why: string
	// The send buttons.
	children: ReactNode
}) {
	return (
		<VStack gap="4" alignItems="stretch">
			<VStack gap="1" alignItems="stretch">
				<h2
					className={css({
						fontFamily: "heading",
						fontSize: { base: "2xl", md: "3xl" },
						lineHeight: "1.05",
						overflowWrap: "anywhere",
					})}
				>
					{dare}
				</h2>
				<p className={css({ fontSize: "md", color: "fg.muted" })}>{why}</p>
			</VStack>
			{children}
		</VStack>
	)
}
