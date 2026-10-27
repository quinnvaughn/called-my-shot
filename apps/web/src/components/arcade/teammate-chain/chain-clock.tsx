import { chainTimeLabel } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { useNow } from "#/hooks/use-now"

// The running time since Start, ticking each second. Time only breaks a tie
// between two chains of the same length.
export function ChainClock({ startedAt }: { startedAt: string }) {
	const now = useNow(1000)
	const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
	return (
		<span
			role="timer"
			aria-label="Time"
			className={css({
				fontFamily: "mono",
				fontVariantNumeric: "tabular-nums",
			})}
		>
			{chainTimeLabel(seconds)}
		</span>
	)
}
