import {
	REDRAFT_DOWN_COLOR,
	REDRAFT_UP_COLOR,
	redraftMove,
} from "@called-my-shot/schemas"
import { FaCaretDown, FaCaretUp } from "react-icons/fa"
import { css } from "styled-system/css"
import { match } from "ts-pattern"

// How far a pick moved from the real draft, as a pill on the app's dark
// ground so it reads on any team's color: green ▲3 for someone taken three
// picks earlier than they really were, red ▼1 for later, a grey "Same" for
// the same slot. An undrafted player is green, since any slot is a climb.
export function MoveBadge({
	slot,
	original,
}: {
	slot: number
	// Null for a player who came in undrafted.
	original: number | null
}) {
	const move = redraftMove(slot, original)
	const { color, label, title } = match(move)
		.with({ kind: "up" }, ({ by }) => ({
			color: REDRAFT_UP_COLOR,
			label: (
				<>
					<FaCaretUp aria-hidden />
					{by}
				</>
			),
			title: `Went #${original} in the real draft`,
		}))
		.with({ kind: "down" }, ({ by }) => ({
			color: REDRAFT_DOWN_COLOR,
			label: (
				<>
					<FaCaretDown aria-hidden />
					{by}
				</>
			),
			title: `Went #${original} in the real draft`,
		}))
		.with({ kind: "same" }, () => ({
			color: undefined,
			label: "Same",
			title: "Same slot as the real draft",
		}))
		.with({ kind: "undrafted" }, () => ({
			color: REDRAFT_UP_COLOR,
			label: "Undrafted",
			title: "Went undrafted in the real draft",
		}))
		.exhaustive()
	return (
		<span
			title={title}
			aria-label={title}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.5",
				flexShrink: 0,
				minWidth: "10",
				padding: "{spacing.0.5} {spacing.2}",
				borderRadius: "full",
				bg: "bg.canvas",
				color: "fg.muted",
				fontFamily: "mono",
				fontSize: "xs",
				fontWeight: "bold",
				whiteSpace: "nowrap",
			})}
			style={color ? { color } : undefined}
		>
			{label}
		</span>
	)
}
