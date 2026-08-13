import { FaRegSquare, FaSquareCheck } from "react-icons/fa6"
import { css } from "styled-system/css"

type Props = {
	called: boolean
	// Whether the question is still open to new calls. When false and the
	// viewer hasn't called, there's nothing left for them to do here, so the
	// chip (which would otherwise read "Call") is omitted entirely rather than
	// advertising an action that's no longer available.
	canCall: boolean
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
export function ViewerCallStatusIcon({ called, canCall, size = 11 }: Props) {
	if (!called && !canCall) return null

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
