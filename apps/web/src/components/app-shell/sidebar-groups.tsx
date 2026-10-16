import { useSuspenseQuery } from "@tanstack/react-query"
import { FaUserGroup } from "react-icons/fa6"
import { FiPlus } from "react-icons/fi"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { SidebarGroupsDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"
import { SidebarGroupLink } from "./sidebar-group-link"
import { SidebarNavLink } from "./sidebar-nav-link"
import { sidebarLeading, sidebarRow } from "./sidebar-row"
import { SidebarSection } from "./sidebar-section"
import type { League } from "./types"

// Loaded by the _app layout for a signed-in viewer, so the list is there on
// the first render instead of filling in after the page draws.
export const sidebarGroupsQuery = gqlQueryOptions(SidebarGroupsDocument, {})

// Signed-in only: the caller doesn't render it for a signed-out reader.
export function SidebarGroups({
	leagues,
	onNavigate,
}: {
	leagues: League[]
	onNavigate: () => void
}) {
	const { data } = useSuspenseQuery(sidebarGroupsQuery)
	const groups = data.myGroups

	return (
		<SidebarSection id="groups" label="GROUPS">
			<SidebarNavLink
				to="/groups"
				label="All Groups"
				icon={FaUserGroup}
				onNavigate={onNavigate}
				exact
			/>
			<button
				type="button"
				onClick={() => {
					onNavigate()
					openModal(<NewGroupModal leagues={leagues} />)
				}}
				className={sidebarRow}
			>
				<span className={sidebarLeading}>
					<FiPlus size={18} />
				</span>
				New Group
			</button>
			{groups.map((group) => (
				<SidebarGroupLink
					key={group.id}
					group={group}
					onNavigate={onNavigate}
				/>
			))}
		</SidebarSection>
	)
}
