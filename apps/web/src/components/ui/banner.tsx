import { cva } from "styled-system/css"
import { coverImage } from "./avatar"

// 4:1, matching IMAGE_DIMENSIONS in @called-my-shot/schemas, so what the crop
// modal frames is exactly what shows.
const frame = cva({
	base: {
		width: "full",
		aspectRatio: "4 / 1",
		overflow: "hidden",
		bg: "bg.subtle",
	},
	variants: {
		variant: {
			// A card or preview: rounded and bordered like everything around it.
			inset: {
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
			},
			// Edge to edge across the top of a page (see PageBanner), so only its
			// bottom edge meets content.
			flush: {
				borderBottom: "1px solid {colors.border.default}",
			},
		},
	},
	defaultVariants: { variant: "inset" },
})

type Variant = "inset" | "flush"

// The image across the top of a profile or group page. Renders nothing
// without one; pages that keep the slot pair it with BannerPlaceholder.
export function Banner({
	src,
	variant,
}: {
	src: string | null | undefined
	variant?: Variant
}) {
	if (!src) return null
	return (
		<div className={frame({ variant })}>
			<img src={src} alt="" className={coverImage} decoding="async" />
		</div>
	)
}

// The empty frame: a page's default banner, and the settings preview before
// one exists.
export function BannerPlaceholder({ variant }: { variant?: Variant }) {
	return <div className={frame({ variant })} />
}
