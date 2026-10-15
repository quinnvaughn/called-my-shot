import { css } from "styled-system/css"

export function ChipTeam({ abbr, picked }: { abbr: string; picked: boolean }) {
	return (
		<span
			className={css({
				paddingInline: "1",
				borderRadius: "sm",
				fontWeight: picked ? "bold" : "normal",
				color: picked ? "secondary.default" : "fg.muted",
				bg: picked ? "secondary.subtle" : "transparent",
			})}
		>
			{abbr}
		</span>
	)
}
