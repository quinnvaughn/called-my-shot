import { FaRegSquare, FaSquareCheck } from "react-icons/fa6"
import { css } from "styled-system/css"

type Props = {
	called: boolean
	size?: number
}

// Answers "have I called this?" without the full pick/conviction/result
// detail - that lives on CallCard and the question's own detail page, so a
// viewer skimming a feed of QuestionCards (or someone else's CallCard in a
// group's answered feed) can spot what they've done vs. still need to without
// reading a full line per card. Used to be icon-only (checked/unchecked
// square), but the checkbox metaphor alone read as ambiguous rather than as
// a status/prompt - pairing it with a short label ("Called"/"Call") makes the
// meaning immediate without reading as a clickable button. Styled like a Tag
// (pill, filled) rather than a bare icon+text pair since it sits inline with
// the other tag chips now.
export function ViewerCallStatusIcon({ called, size = 11 }: Props) {
	const Icon = called ? FaSquareCheck : FaRegSquare
	const label = called ? "Called" : "Call"
	return (
		<div
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "1",
				fontFamily: "mono",
				fontSize: "xs",
				fontWeight: "medium",
				letterSpacing: "wide",
				whiteSpace: "nowrap",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "sm",
				backgroundColor: called ? "success.subtle" : "bg.subtle",
				color: called ? "success.default" : "fg.muted",
			})}
		>
			<Icon size={size} />
			{label}
		</div>
	)
}
