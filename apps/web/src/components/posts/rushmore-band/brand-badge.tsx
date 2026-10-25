import { css } from "styled-system/css"
import { Brand } from "#/components/ui/brand"

// The app's logo on its own dark ground, the way the share image carries it,
// so it reads on any team's color and stays in every screenshot of the band.
export function BrandBadge() {
	return (
		<span
			className={css({
				display: "inline-flex",
				padding: "{spacing.1.5} {spacing.2.5}",
				borderRadius: "md",
				bg: "bg.canvas",
			})}
		>
			<Brand size="sm" />
		</span>
	)
}
