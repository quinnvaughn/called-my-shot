import { createContext, type HTMLAttributes, useContext } from "react"
import { cx, sva } from "styled-system/css"
import type { RecipeVariantProps } from "styled-system/types"

const cardRecipe = sva({
	slots: ["root", "header", "body", "footer"],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			borderRadius: "2xl",
			border: "1px solid {colors.border.default}",
			overflow: "hidden",
		},
		header: {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			borderBottom: "1px solid {colors.border.default}",
		},
		body: {
			flex: "1",
		},
		footer: {
			borderTop: "1px solid {colors.border.default}",
		},
	},
	variants: {
		variant: {
			surface: { root: { bg: "bg.surface" } },
			subtle: { root: { bg: "bg.subtle" } },
			outline: { root: { bg: "transparent" } },
		},
		interactive: {
			true: {
				root: {
					transition: "border-color 0.15s ease",
					_hover: { border: "1px solid {colors.border.emphasized}" },
				},
			},
		},
		accent: {
			true: { root: { border: "1px solid {colors.primary.default}" } },
		},
		size: {
			sm: {
				header: { padding: "3", gap: "2" },
				body: { padding: "3" },
				footer: { padding: "3", gap: "2" },
			},
			md: {
				header: { padding: "4", gap: "3" },
				body: { padding: "4" },
				footer: { padding: "4", gap: "3" },
			},
			lg: {
				header: { padding: "6", gap: "4" },
				body: { padding: "6" },
				footer: { padding: "6", gap: "4" },
			},
		},
	},
	defaultVariants: {
		variant: "surface",
		size: "md",
	},
})

export type CardVariantProps = RecipeVariantProps<typeof cardRecipe>

type CardSlots = ReturnType<typeof cardRecipe>

const CardContext = createContext<CardSlots | null>(null)

function useCardSlots(part: string) {
	const slots = useContext(CardContext)
	if (!slots) {
		throw new Error(`Card.${part} must be rendered inside <Card>`)
	}
	return slots
}

type CardProps = HTMLAttributes<HTMLDivElement> & CardVariantProps

function Card({
	variant,
	size,
	interactive,
	accent,
	className,
	children,
	...props
}: CardProps) {
	const slots = cardRecipe({ variant, size, interactive, accent })
	return (
		<CardContext.Provider value={slots}>
			<div className={cx(slots.root, className)} {...props}>
				{children}
			</div>
		</CardContext.Provider>
	)
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const slots = useCardSlots("Header")
	return <div className={cx(slots.header, className)} {...props} />
}

function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const slots = useCardSlots("Body")
	return <div className={cx(slots.body, className)} {...props} />
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const slots = useCardSlots("Footer")
	return <div className={cx(slots.footer, className)} {...props} />
}

Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter

export { Card }
