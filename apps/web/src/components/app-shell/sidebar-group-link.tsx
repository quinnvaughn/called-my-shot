import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { GroupLogo } from "#/components/ui/group-logo"
import { sidebarRow, sidebarRowActive } from "./sidebar-row"

export function SidebarGroupLink({
	group,
	onNavigate,
}: {
	group: { id: string; name: string; logoUrl?: string | null }
	onNavigate: () => void
}) {
	return (
		<Link
			to="/groups/$groupId"
			params={{ groupId: group.id }}
			onClick={onNavigate}
			activeProps={{ className: sidebarRowActive }}
			className={sidebarRow}
		>
			<GroupLogo name={group.name} src={group.logoUrl} size="xs" />
			<span className={css({ truncate: true })}>{group.name}</span>
		</Link>
	)
}
