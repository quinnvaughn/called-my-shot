import { cva, cx } from "styled-system/css"
import { FlairMark } from "./flair-mark"

// What the server resolved this flair down to. The client never branches on
// whether it came from a team or a catalog entry - see the Flair type's
// icon/label/color fields in the api.
export type FlairData = {
	icon: string
	label: string
	color: string
}

const chipStyle = cva({
	base: {
		display: "inline-flex",
		alignItems: "stretch",
		borderRadius: "sm",
		overflow: "hidden",
		// Allowed to shrink, unlike the mark inside it: in a row that runs out
		// of width the label truncates rather than pushing the name and handle
		// out, which is what a fixed-width chip did.
		minWidth: "0",
		maxWidth: "full",
		fontFamily: "mono",
		border: "1px solid {colors.border.default}",
	},
	variants: {
		size: {
			xs: { fontSize: "3xs" },
			sm: { fontSize: "2xs" },
		},
	},
	defaultVariants: { size: "xs" },
})

const chipLabelStyle = cva({
	base: {
		color: "fg.body",
		backgroundColor: "bg.subtle",
		display: "flex",
		alignItems: "center",
		minWidth: "0",
		truncate: true,
	},
	variants: {
		size: {
			xs: { padding: "{spacing.0.5} {spacing.1}" },
			sm: { padding: "{spacing.0.5} {spacing.1.5}" },
		},
	},
	defaultVariants: { size: "xs" },
})

type Props = {
	flair: FlairData
	size?: "xs" | "sm"
	className?: string
}

// The chip shown beside a name wherever someone is credited. One line, and it
// truncates rather than wraps, because it sits inside rows that are already
// fighting for width.
export function Flair({ flair, size = "xs", className }: Props) {
	return (
		<span className={cx(chipStyle({ size }), className)} title={flair.label}>
			<FlairMark flair={flair} size={size} />
			<span className={chipLabelStyle({ size })}>{flair.label}</span>
		</span>
	)
}
