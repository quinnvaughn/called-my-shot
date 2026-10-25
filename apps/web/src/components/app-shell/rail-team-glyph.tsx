import { useState } from "react"
import { css } from "styled-system/css"
import { readableTextColor } from "#/lib/color"
import { imageFraming } from "#/lib/image-framing"
import { railGlyph } from "./rail-tile"

type Props = {
	abbreviation: string
	color: string
	logoUrl: string | null | undefined
}

// A followed team's tile on the space rail: its logo in the same rounded
// square the league tiles use, or its abbreviation on the team's color when
// there's no logo or it fails to load.
export function RailTeamGlyph({ abbreviation, color, logoUrl }: Props) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null)

	if (logoUrl && logoUrl !== failedSrc) {
		return (
			<span className={railGlyph}>
				{/* Empty alt: the tile's label names the team. */}
				<img
					src={logoUrl}
					alt=""
					loading="lazy"
					decoding="async"
					onError={() => setFailedSrc(logoUrl)}
					style={imageFraming(logoUrl)}
					className={css({ width: "7", height: "7", objectFit: "contain" })}
				/>
			</span>
		)
	}
	return (
		<span
			className={railGlyph}
			style={{ backgroundColor: color, color: readableTextColor(color) }}
		>
			{abbreviation}
		</span>
	)
}
