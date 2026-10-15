import { FaCheck, FaXmark } from "react-icons/fa6"
import { css } from "styled-system/css"
import { LiveDot } from "#/components/ui/live-dot"

type State = "win" | "loss" | "pending"

type Props = {
	state: State
}

// The small circular indicator on each row of a PickList - check/x for a
// settled pick, a pulsing dot while it's still live. Same pulse keyframe used
// for the pending-call badge elsewhere (see viewer-status-card.tsx).
export function PickStateIcon({ state }: Props) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: "0",
				width: "4",
				height: "4",
				borderRadius: "full",
				color:
					state === "win"
						? "success.default"
						: state === "loss"
							? "danger.default"
							: "fg.subtle",
				backgroundColor:
					state === "win"
						? "success.subtle"
						: state === "loss"
							? "danger.subtle"
							: "bg.subtle",
			})}
		>
			{state === "win" && <FaCheck size={9} />}
			{state === "loss" && <FaXmark size={9} />}
			{state === "pending" && <LiveDot tone="current" />}
		</div>
	)
}
