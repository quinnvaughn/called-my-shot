import { useEffect, useRef } from "react"
import { css } from "styled-system/css"
import { useNow } from "#/hooks/use-now"

// The question's clock, seconds left with a bar that drains. Calls
// `onExpire` once when it hits zero.
export function WatchCountdown({
	deadline,
	totalMs,
	onExpire,
}: {
	deadline: number
	totalMs: number
	onExpire: () => void
}) {
	const now = useNow(100)
	const left = Math.max(0, deadline - now)
	// The deadline it last ran out on, so each clock fires once.
	const firedFor = useRef<number | null>(null)

	useEffect(() => {
		if (left > 0 || firedFor.current === deadline) return
		firedFor.current = deadline
		onExpire()
	}, [left, deadline, onExpire])

	return (
		<div className={css({ display: "flex", alignItems: "center", gap: "3" })}>
			<div
				className={css({
					flex: "1",
					height: "2",
					borderRadius: "full",
					bg: "bg.subtle",
					overflow: "hidden",
				})}
			>
				<div
					className={css({
						height: "full",
						borderRadius: "full",
						bg: "watch.default",
						transition: "width 0.1s linear",
					})}
					style={{ width: `${(left / totalMs) * 100}%` }}
				/>
			</div>
			<span
				role="timer"
				aria-label="Time left"
				className={css({
					fontFamily: "mono",
					fontWeight: "bold",
					fontVariantNumeric: "tabular-nums",
					minWidth: "10",
					textAlign: "right",
				})}
			>
				{(left / 1000).toFixed(1)}
			</span>
		</div>
	)
}
