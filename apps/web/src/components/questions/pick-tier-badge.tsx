import { css } from "styled-system/css"
import { crowdTierFor } from "#/lib/scoring"

export function PickTierBadge({
	fieldPct,
	totalOptions,
	modelHitRate = null,
}: {
	fieldPct: number
	totalOptions: number
	// The side's own price, when it has one. A priced side has no boldness
	// tier, so no badge - see crowdTierFor.
	modelHitRate?: number | null
}) {
	const tier = crowdTierFor(fieldPct, totalOptions, { modelHitRate })
	if (!tier) return null
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "3xs",
				fontWeight: "bold",
				letterSpacing: "wide",
				color: "fg.subtle",
				border: "1px solid {colors.border.default}",
				borderRadius: "sm",
				padding: "{spacing.0.5} {spacing.1.5}",
				flexShrink: "0",
			})}
		>
			{tier.label} ×{tier.mult.toFixed(1)}
		</span>
	)
}
