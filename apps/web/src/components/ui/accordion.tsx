import { type ReactNode, useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type Props = {
	id?: string
	title: string
	subtitle?: string
	defaultOpen?: boolean
	children: ReactNode
}

export function Accordion({
	id,
	title,
	subtitle,
	defaultOpen = false,
	children,
}: Props) {
	const [open, setOpen] = useState(defaultOpen)

	return (
		<VStack id={id} alignItems="stretch" gap="0">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className={css({
					width: "full",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "4",
					background: "bg.surface",
					border: "1px solid {colors.border.default}",
					borderRadius: open ? "{radii.xl} {radii.xl} 0 0" : "xl",
					padding: "4",
					textAlign: "left",
					cursor: "pointer",
					_hover: { border: "1px solid {colors.border.emphasized}" },
				})}
			>
				<VStack gap="0.5" alignItems="flex-start">
					<span
						className={css({
							fontFamily: "heading",
							fontSize: "md",
						})}
					>
						{title}
					</span>
					{subtitle && (
						<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
							{subtitle}
						</span>
					)}
				</VStack>
				<span className={css({ flexShrink: 0, color: "fg.subtle" })}>
					{open ? <FiChevronUp /> : <FiChevronDown />}
				</span>
			</button>
			{open && (
				<VStack
					alignItems="stretch"
					gap="3"
					className={css({
						background: "bg.surface",
						border: "1px solid {colors.border.default}",
						borderTop: "none",
						borderRadius: "0 0 {radii.xl} {radii.xl}",
						padding: "4",
					})}
				>
					{children}
				</VStack>
			)}
		</VStack>
	)
}
