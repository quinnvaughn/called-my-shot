import { Link } from "@tanstack/react-router"
import {
	type FocusEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useState,
} from "react"
import { css, cva } from "styled-system/css"
import { RailTooltip, type RailTooltipAnchor } from "./rail-tooltip"

// The 40px rounded square most tiles draw inside. Group tiles draw their
// GroupLogo instead, which is the same size and shape.
export const railGlyph = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "10",
	height: "10",
	borderRadius: "md",
	bg: "bg.subtle",
	border: "1px solid {colors.border.default}",
	fontFamily: "mono",
	fontSize: "2xs",
	fontWeight: "bold",
	letterSpacing: "normal",
})

export const railGlyphDashed = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "10",
	height: "10",
	borderRadius: "md",
	border: "1px dashed {colors.border.emphasized}",
})

// Active is a ring round the tile and a bar against the rail's left edge, in
// the default foreground: it marks where you are rather than something to
// press.
const tile = cva({
	base: {
		position: "relative",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		width: "10",
		height: "10",
		borderRadius: "md",
		color: "fg.subtle",
		cursor: "pointer",
		transition: "color 0.15s ease",
		_hover: { color: "fg.default" },
		_focusVisible: {
			outline: "2px solid {colors.primary.default}",
			outlineOffset: "2px",
		},
	},
	variants: {
		active: {
			true: {
				color: "fg.default",
				outline: "2px solid {colors.fg.default}",
				outlineOffset: "2px",
			},
		},
	},
})

const activeBar = css({
	position: "absolute",
	// The rail's side padding, so the bar sits on the rail's edge.
	left: "calc({spacing.3} * -1)",
	top: "2",
	bottom: "2",
	width: "1",
	borderRadius: "0 4px 4px 0",
	bg: "fg.default",
})

type Props = {
	label: string
	active?: boolean
	children: ReactNode
} & ({ to: string; onClick?: never } | { to?: never; onClick: () => void })

// One tile in the space rail. The label is the tile's accessible name, and
// shows beside it on mouse hover and keyboard focus.
export function RailTile({
	label,
	active = false,
	children,
	to,
	onClick,
}: Props) {
	const [anchor, setAnchor] = useState<RailTooltipAnchor | null>(null)

	// The tip is fixed in place, so it closes once the rail or page scrolls
	// out from under it rather than following the tile.
	useEffect(() => {
		if (!anchor) return
		function close() {
			setAnchor(null)
		}
		document.addEventListener("scroll", close, true)
		window.addEventListener("resize", close)
		return () => {
			document.removeEventListener("scroll", close, true)
			window.removeEventListener("resize", close)
		}
	}, [anchor])

	function show(element: HTMLElement) {
		const rect = element.getBoundingClientRect()
		setAnchor({ right: rect.right, centerY: rect.top + rect.height / 2 })
	}
	function hide() {
		setAnchor(null)
	}

	const shared = {
		"aria-label": label,
		className: tile({ active }),
		onPointerEnter: (event: PointerEvent<HTMLElement>) => {
			if (event.pointerType === "mouse") show(event.currentTarget)
		},
		onPointerLeave: hide,
		onFocus: (event: FocusEvent<HTMLElement>) => show(event.currentTarget),
		onBlur: hide,
	}
	const content = (
		<>
			{active && <span aria-hidden className={activeBar} />}
			{children}
			{anchor && <RailTooltip anchor={anchor} label={label} />}
		</>
	)
	if (to !== undefined) {
		return (
			<Link to={to} aria-current={active ? "page" : undefined} {...shared}>
				{content}
			</Link>
		)
	}
	return (
		<button type="button" onClick={onClick} {...shared}>
			{content}
		</button>
	)
}
