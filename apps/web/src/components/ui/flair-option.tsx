import { css } from "styled-system/css"
import type { FlairData } from "./flair"
import { FlairMark } from "./flair-mark"

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
				textStyle: "meta",
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
