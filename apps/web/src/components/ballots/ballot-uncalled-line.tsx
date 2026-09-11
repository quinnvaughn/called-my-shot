import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type Props = {
	heading: string
	// Each member's slot, or its label where it has none.
	labels: string[]
}

// Closes out the entry page's member list: the members someone didn't call,
// named on one line instead of a row apiece, since a row with no pick has
// nothing to show about them.
export function BallotUncalledLine({ heading, labels }: Props) {
	return (
		<VStack
			gap="1"
			alignItems="flex-start"
			className={css({
				padding: "3",
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				{heading} ({labels.length})
			</span>
			<span className={css({ fontSize: "xs", color: "fg.muted" })}>
				{labels.join(", ")}
			</span>
		</VStack>
	)
}
