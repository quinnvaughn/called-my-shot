import { Link } from "@tanstack/react-router"
import type { IconType } from "react-icons/lib"
import { sidebarLeading, sidebarRow, sidebarRowActive } from "./sidebar-row"

export function SidebarNavLink({
	to,
	label,
	icon: Icon,
	onNavigate,
	exact = false,
}: {
	to: string
	label: string
	icon: IconType
	onNavigate: () => void
	// Only this page, not the pages under it, when those have rows of their
	// own (each group under All Groups).
	exact?: boolean
}) {
	return (
		<Link
			to={to}
			onClick={onNavigate}
			activeProps={{ className: sidebarRowActive }}
			activeOptions={{ exact }}
			className={sidebarRow}
		>
			<span className={sidebarLeading}>
				<Icon size={18} />
			</span>
			{label}
		</Link>
	)
}
