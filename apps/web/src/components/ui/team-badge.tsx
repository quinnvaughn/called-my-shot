import { useState } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { readableTextColor } from "#/lib/color"
import { imageFraming } from "#/lib/image-framing"

type Props = {
	abbreviation: string
	// Raw hex from teams.color - arbitrary per-team, so this can't be a themed
	// Tag variant; set directly via inline style instead.
	color: string
	// The team's logo on its league's CDN (teams.logoUrl). Shown in place of
	// the pill once it loads; null, missing or failing to load keeps the pill.
	logoUrl?: string | null
	// The logo's size. The pill is the same at both.
	size?: "sm" | "lg"
	// Keeps the abbreviation beside the logo, for a spot where the badge is the
	// team's only label. Off where the team's name already sits next to it.
	showAbbreviation?: boolean
}

const abbreviationClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	fontWeight: "bold",
	letterSpacing: "wide",
	color: "fg.default",
})

export function TeamBadge({
	abbreviation,
	color,
	logoUrl,
	size = "sm",
	showAbbreviation = false,
}: Props) {
	// Remembers which URL failed rather than a plain flag, so a re-synced logo
	// gets its own chance to load.
	const [failedSrc, setFailedSrc] = useState<string | null>(null)

	if (logoUrl && logoUrl !== failedSrc) {
		return (
			<HStack gap="1.5" alignItems="center" flexShrink="0">
				{/* Empty alt: the team's name or abbreviation is always rendered
				    beside the logo. */}
				<img
					src={logoUrl}
					alt=""
					loading="lazy"
					decoding="async"
					onError={() => setFailedSrc(logoUrl)}
					style={imageFraming(logoUrl)}
					className={css({
						width: size === "lg" ? "12" : "8",
						height: size === "lg" ? "12" : "8",
						objectFit: "contain",
						flexShrink: "0",
					})}
				/>
				{showAbbreviation && (
					<span className={abbreviationClass}>{abbreviation}</span>
				)}
			</HStack>
		)
	}

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
