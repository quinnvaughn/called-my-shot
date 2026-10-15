import { cva } from "styled-system/css"
import { readableTextColor } from "#/lib/color"
import type { FlairData } from "./flair"

// Local cvas rather than config recipes, so every size variant is generated
// at build without an entry in panda.config's staticCss - `size` is always
// passed through a variable at the call sites below.
const markStyle = cva({
	base: {
		fontFamily: "mono",
		fontWeight: "bold",
		letterSpacing: "wide",
		flexShrink: "0",
		alignSelf: "stretch",
		display: "flex",
		alignItems: "center",
	},
	variants: {
		size: {
			xs: { fontSize: "3xs", padding: "{spacing.0.5} {spacing.1}" },
			sm: { fontSize: "2xs", padding: "{spacing.0.5} {spacing.1.5}" },
		},
	},
	defaultVariants: { size: "xs" },
})

// The colored block carrying the abbreviation. Team colors are arbitrary hex
// straight from ESPN rather than theme tokens, so the background and its text
// color are set inline - the same thing TeamBadge does, and for the same
// reason: no themed variant can cover a color we don't control.
export function FlairMark({
	flair,
	size = "xs",
}: {
	flair: FlairData
	size?: "xs" | "sm"
}) {
	return (
		<span
			className={markStyle({ size })}
			style={{
				backgroundColor: flair.color,
				color: readableTextColor(flair.color),
			}}
		>
			{flair.icon}
		</span>
	)
}
