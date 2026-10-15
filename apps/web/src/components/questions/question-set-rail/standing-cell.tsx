import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import type { RailTone } from "#/lib/game-set-rail"
import { TONE_COLOR } from "./rail-styles"

// One line under the pick: the number, then what it means when the number
// alone doesn't say.
export function StandingCell({
	value,
	detail,
	tone,
}: {
	value: ReactNode
	detail?: string
	tone: RailTone
}) {
	return (
		<span
			className={css({
				textStyle: "metaLg",
				whiteSpace: "nowrap",
				marginInlineStart: "auto",
			})}
		>
			<span className={cx(css({ fontWeight: "bold" }), TONE_COLOR[tone])}>
				{value}
			</span>
			{detail && <span className={TONE_COLOR.muted}> · {detail}</span>}
		</span>
	)
}
