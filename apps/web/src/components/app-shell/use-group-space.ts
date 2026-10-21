import { useQuery } from "@tanstack/react-query"
import { groupShellQuery, sidebarGroupsQuery } from "#/graphql/groups/queries"
import { useMe } from "#/hooks/use-me"

// The group a group space belongs to, for the side column's header and the
// sections it lists. The group's tabs load the shell query before they
// render; the pages under them that sit outside the tabs (a board, a chain,
// settings) don't, so it fills in here, with the name from the rail's list
// in the meantime. Never suspends, since the shell draws around the page.
export function useGroupSpace(groupId: string | null) {
	const me = useMe()
	const enabled = !!me && !!groupId
	const { data: shellData } = useQuery({
		...groupShellQuery(groupId ?? ""),
		enabled,
	})
	const { data: listData } = useQuery({ ...sidebarGroupsQuery, enabled })

	const shell = shellData?.group ?? null
	const listed = listData?.myGroups.find((group) => group.id === groupId)
	return {
		name: shell?.name ?? listed?.name ?? null,
		logoUrl: shell?.logoUrl ?? listed?.logoUrl ?? null,
		memberCount: shell?.memberCount ?? null,
		sectionShell: shell
			? {
					activeChainCount: shell.activeChainCount,
					viewerIsMember: shell.viewerIsMember,
				}
			: null,
	}
}
