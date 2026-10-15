import { css, cx } from "styled-system/css"
import type { RailTone } from "#/lib/game-set-rail"

export const labelBase = css({
	textStyle: "label",
})

export const railHeadingClass = cx(labelBase, css({ color: "fg.muted" }))

export const railHeadingLinkClass = cx(
	labelBase,
	css({
		color: "fg.muted",
		textDecoration: "none",
		_hover: { color: "fg.default" },
	}),
)

export const subtleLabelClass = cx(
	labelBase,
	css({ color: "fg.subtle", whiteSpace: "nowrap" }),
)

export const monoSmall = css({
	textStyle: "metaLg",
	color: "fg.subtle",
})

export const TONE_COLOR: Record<RailTone, string> = {
	success: css({ color: "success.default" }),
	danger: css({ color: "danger.default" }),
	muted: css({ color: "fg.subtle" }),
	default: css({ color: "fg.default" }),
}
