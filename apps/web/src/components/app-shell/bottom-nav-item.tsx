import { Link } from "@tanstack/react-router"
import type { IconType } from "react-icons/lib"
import { cva } from "styled-system/css"

const item = cva({
	base: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: "1",
		// The nav's row height, which styles.css also sizes
		// --bottom-nav-height from.
		height: "14",
		textStyle: "labelSm",
		fontWeight: "bold",
		color: "fg.subtle",
		cursor: "pointer",
		_focusVisible: {
			outline: "2px solid {colors.primary.default}",
			outlineOffset: "-2px",
		},
	},
	variants: {
		active: {
			true: { color: "fg.default" },
		},
	},
})

type Props = {
	label: string
	icon: IconType
	active?: boolean
} & ({ to: string; onClick?: never } | { to?: never; onClick: () => void })

export function BottomNavItem({
	label,
	icon: Icon,
	active = false,
	to,
	onClick,
}: Props) {
	const content = (
		<>
			<Icon size={20} aria-hidden />
			{label}
		</>
	)
	if (to !== undefined) {
		return (
			<Link
				to={to}
				aria-current={active ? "page" : undefined}
				className={item({ active })}
			>
				{content}
			</Link>
		)
	}
	return (
		<button type="button" onClick={onClick} className={item({ active })}>
			{content}
		</button>
	)
}
