import { createPortal } from "react-dom"
import { css } from "styled-system/css"

export type RailTooltipAnchor = { right: number; centerY: number }

// A space rail tile's name, beside the tile. Portalled and fixed because the
// rail scrolls, which clips anything drawn past its edge. Larger and higher
// contrast than the column toggle's tooltip, since the tiles are mostly
// glyphs and this is the only place their names show.
export function RailTooltip({
	anchor,
	label,
}: {
	anchor: RailTooltipAnchor
	label: string
}) {
	return createPortal(
		<div
			aria-hidden
			className={css({
				position: "fixed",
				zIndex: "popover",
				transform: "translateY(-50%)",
				whiteSpace: "nowrap",
				padding: "{spacing.2} {spacing.3}",
				borderRadius: "lg",
				bg: "bg.raised",
				border: "1px solid {colors.border.emphasized}",
				boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
				fontSize: "sm",
				fontWeight: "semibold",
				color: "fg.default",
				pointerEvents: "none",
				// The arrow pointing back at the tile: a square turned 45deg,
				// half of it past the tip's left edge, bordered on the two sides
				// that show.
				_before: {
					content: '""',
					position: "absolute",
					top: "50%",
					left: "0",
					width: "2.5",
					height: "2.5",
					bg: "bg.raised",
					borderLeft: "1px solid {colors.border.emphasized}",
					borderBottom: "1px solid {colors.border.emphasized}",
					transform: "translate(-50%, -50%) rotate(45deg)",
				},
			})}
			// Clears the rail's side padding (3) plus a gap, so the tip starts
			// just past the rail's edge.
			style={{ left: anchor.right + 20, top: anchor.centerY }}
		>
			{label}
		</div>,
		document.body,
	)
}
