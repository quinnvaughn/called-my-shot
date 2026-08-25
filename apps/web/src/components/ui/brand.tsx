import type { ImgHTMLAttributes } from "react"
import { cva, cx } from "styled-system/css"
import type { RecipeVariantProps } from "styled-system/types"
import logoUrl from "#/assets/logo.svg?url"

const brandRecipe = cva({
	base: {
		display: "block",
	},
	variants: {
		size: {
			sm: { h: "4" },
			md: { h: { base: "4", md: "5" } },
			nav: { h: { base: "0.85rem", md: "5" } },
		},
	},
	defaultVariants: {
		size: "md",
	},
})

export type BrandVariantProps = RecipeVariantProps<typeof brandRecipe>

type BrandProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> &
	BrandVariantProps

export function Brand({ size, className, ...props }: BrandProps) {
	return (
		<img
			src={logoUrl}
			alt="Called My Shot"
			className={cx(brandRecipe({ size }), className)}
			{...props}
		/>
	)
}
