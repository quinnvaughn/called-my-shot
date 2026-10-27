import { css } from "styled-system/css"
import { sharePercent } from "./chain-result"

// Beside a player in a solved route: the share of today's solvers whose
// route went through him too.
export function ChainRarityShare({ share }: { share: number }) {
	return (
		<span
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "flex-end",
				flexShrink: 0,
			})}
		>
			<span className={css({ fontFamily: "heading", fontSize: "md" })}>
				{sharePercent(share)}%
			</span>
			<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
				of solvers
			</span>
		</span>
	)
}
