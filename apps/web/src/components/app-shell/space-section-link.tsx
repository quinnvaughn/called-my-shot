import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { CountBadge } from "#/components/ui/count-badge"
import { sidebarLeading, sidebarRow, sidebarRowActive } from "./sidebar-row"
import type { SpaceSection } from "./space-sections"

// One row of the side column, or of the More sheet on phones.
export function SpaceSectionLink({
	section,
	onNavigate,
}: {
	section: SpaceSection
	onNavigate?: () => void
}) {
	const Icon = section.icon
	return (
		<Link
			to={section.to}
			search={section.search}
			onClick={onNavigate}
			activeProps={{ className: sidebarRowActive }}
			activeOptions={{
				exact: section.exact ?? false,
				includeSearch: !!section.search,
			}}
			className={sidebarRow}
		>
			<span className={sidebarLeading}>
				<Icon size={18} />
			</span>
			<span className={css({ truncate: true })}>{section.label}</span>
			{section.badge !== undefined && (
				<span className={css({ marginInlineStart: "auto" })}>
					<CountBadge count={section.badge} />
				</span>
			)}
		</Link>
	)
}
