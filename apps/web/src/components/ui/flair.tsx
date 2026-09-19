import { css, cva, cx } from "styled-system/css"
import { readableTextColor } from "#/lib/color"

// What the server resolved this flair down to. The client never branches on
// whether it came from a team or a catalog entry - see the Flair type's
// icon/label/color fields in the api.
export type FlairData = {
	icon: string
	label: string
	color: string
}

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
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
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

// The picker's cell. Deliberately NOT a Flair wrapped in a ring: that drew the
// chip's border and the ring's, one inside the other with a gap between them.
// This owns a single border and swaps its color for hover and selection, so
// there is only ever one line around the thing.
//
// The label wraps here rather than truncating. At picker width a single line
// clipped every team to "Atlanta H...", which tells you nothing the
// abbreviation didn't already.
export function FlairOption({
	flair,
	selected,
	onSelect,
}: {
	flair: FlairData
	selected: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={css({
				display: "flex",
				alignItems: "stretch",
				width: "full",
				minWidth: "0",
				borderRadius: "sm",
				overflow: "hidden",
				cursor: "pointer",
				textAlign: "left",
				fontFamily: "mono",
				fontSize: "2xs",
				backgroundColor: "bg.subtle",
				border: "1px solid {colors.border.default}",
				_hover: { border: "1px solid {colors.border.emphasized}" },
				"&[aria-pressed='true']": {
					border: "1px solid {colors.primary.default}",
				},
			})}
		>
			<FlairMark flair={flair} size="sm" />
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					minWidth: "0",
					padding: "{spacing.1} {spacing.1.5}",
					color: "fg.body",
					lineHeight: "1.25",
					overflowWrap: "anywhere",
				})}
			>
				{flair.label}
			</span>
		</button>
	)
}
