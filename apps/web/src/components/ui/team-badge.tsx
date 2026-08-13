import { css } from "styled-system/css"
import { readableTextColor } from "#/lib/color"

type Props = {
	abbreviation: string
	// Raw hex from teams.color - arbitrary per-team, so this can't be a themed
	// Tag variant; set directly via inline style instead.
	color: string
}

export function TeamBadge({ abbreviation, color }: Props) {
	return (
		<span
			className={css({
				display: "inline-flex",
				alignItems: "center",
				fontFamily: "mono",
				fontSize: "2xs",
				fontWeight: "bold",
				letterSpacing: "wide",
				padding: "{spacing.0.5} {spacing.1.5}",
				borderRadius: "sm",
				flexShrink: "0",
			})}
			style={{ backgroundColor: color, color: readableTextColor(color) }}
		>
			{abbreviation}
		</span>
	)
}
