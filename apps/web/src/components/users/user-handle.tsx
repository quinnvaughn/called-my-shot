import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { css, cx } from "styled-system/css"
import { useAnchoredPopover } from "#/components/ui/use-anchored-popover"
import { UserCard, type UserCardData } from "./user-card"

const card = css({
	zIndex: "popover",
	width: { base: "auto", md: "72" },
	padding: "4",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	borderRadius: "xl",
	boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
})

// Below md the hook leaves placement to the content: it sits along the
// bottom of the screen instead of hanging off the name.
const mobileCard = css({
	position: "fixed",
	left: "3",
	right: "3",
	bottom: "3",
})

// A person's name that opens their card in place, the way chat apps do,
// with their profile one tap further. Renders "@username" unless given
// something else to show.
export function UserHandle({
	user,
	children,
}: {
	user: UserCardData
	children?: ReactNode
}) {
	const popover = useAnchoredPopover()
	return (
		// Wrapping a block like Identity, an inline root would add a text
		// line's descender space under it and throw off anything centered
		// beside it.
		<span
			ref={popover.rootRef}
			className={css({
				display: children ? "inline-flex" : "inline",
				minWidth: "0",
			})}
		>
			<button
				ref={popover.triggerRef}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={popover.open}
				onClick={() => (popover.open ? popover.close() : popover.openPopover())}
				className={css({
					display: children ? "inline-flex" : "inline",
					minWidth: "0",
					padding: "0",
					font: "inherit",
					color: "inherit",
					fontWeight: "semibold",
					textAlign: "left",
					cursor: "pointer",
					_hover: children ? {} : { textDecoration: "underline" },
				})}
			>
				{children ?? `@${user.username}`}
			</button>
			{popover.open &&
				createPortal(
					<div
						ref={popover.contentRef}
						role="dialog"
						aria-label={`@${user.username}`}
						className={cx(card, popover.isMobile && mobileCard)}
						style={popover.contentStyle}
					>
						<UserCard user={user} onNavigate={popover.close} />
					</div>,
					document.body,
				)}
		</span>
	)
}
