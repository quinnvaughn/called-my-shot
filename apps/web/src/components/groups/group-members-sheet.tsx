import { useQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { Sheet } from "#/components/ui/sheet"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import type { SheetMember } from "./member-sheet-row"
import { MemberSheetSection } from "./member-sheet-section"

// The full roster, unpaginated - groups are small, and unlike the
// leaderboard this lists members who haven't made a resolved call yet.
export const GroupMembersDocument = graphql(`
	query GroupMembers($groupId: ID!) {
		group(id: $groupId) {
			id
			members {
				id
				role
				user {
					id
					name
					username
					avatarUrl
				}
			}
		}
	}
`)

function byName(a: SheetMember, b: SheetMember) {
	return a.name.localeCompare(b.name)
}

export function GroupMembersSheet({
	groupId,
	viewerId,
}: {
	groupId: string
	viewerId?: string
}) {
	const { data } = useQuery(gqlQueryOptions(GroupMembersDocument, { groupId }))
	const memberships = data?.group?.members ?? []
	const usersWithRole = (role: "ADMIN" | "MEMBER") =>
		memberships
			.flatMap((m) => (m.role === role && m.user ? [m.user] : []))
			.sort(byName)

	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>Members</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>
				{data && (
					<VStack alignItems="stretch" gap="5">
						<MemberSheetSection
							label="Admins"
							members={usersWithRole("ADMIN")}
							viewerId={viewerId}
						/>
						<MemberSheetSection
							label="Members"
							members={usersWithRole("MEMBER")}
							viewerId={viewerId}
						/>
					</VStack>
				)}
			</Sheet.Body>
		</Sheet>
	)
}
