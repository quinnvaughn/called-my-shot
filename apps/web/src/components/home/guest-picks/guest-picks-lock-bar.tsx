import { type RefObject, useEffect, useState } from "react"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { pluralize } from "#/lib/pluralize"
import { lockInLabel, openGuestPicksAuth } from "./open-guest-picks-auth"

type Props = {
	// The try-it stack itself. The bar only shows once it's scrolled out of
	// view, since while it's on screen its own button is already the ask.
	stackRef: RefObject<HTMLElement | null>
	pickCount: number
}

// Follows a visitor with calls waiting down Home's feed on mobile, where the
// stack is a full screen above the posts they scroll into. Sits on the bottom
// nav rather than over it.
export function GuestPicksLockBar({ stackRef, pickCount }: Props) {
	const [stackVisible, setStackVisible] = useState(true)

	useEffect(() => {
		const stack = stackRef.current
		if (!stack) return
		const observer = new IntersectionObserver(([entry]) =>
			setStackVisible(entry.isIntersecting),
		)
		observer.observe(stack)
		return () => observer.disconnect()
	}, [stackRef])

	if (pickCount === 0 || stackVisible) return null

	return (
		<div
			className={css({
				display: { base: "flex", md: "none" },
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				position: "fixed",
				insetInline: "0",
				bottom: "var(--bottom-nav-height)",
				zIndex: "launcher",
				padding:
					"{spacing.3} {spacing.4} calc({spacing.3} + var(--bottom-safe-area))",
				bg: "bg.surface/88",
				backdropFilter: "blur(10px)",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<span
				className={css({
					textStyle: "metaLg",
					color: "fg.muted",
					whiteSpace: "nowrap",
				})}
			>
				{pickCount} {pluralize(pickCount, "call")} waiting
			</span>
			<Button
				variant="solid"
				size="sm"
				onClick={() => openGuestPicksAuth("signup", pickCount, "lock_bar")}
			>
				{lockInLabel(pickCount)}
			</Button>
		</div>
	)
}
