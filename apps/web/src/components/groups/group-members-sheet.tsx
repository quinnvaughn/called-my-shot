import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Sheet } from "#/components/ui/sheet"
import { Tag } from "#/components/ui/tag"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"

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
				}
			}
		}
	}
`)

type Member = { id: string; name: string; username: string }

function byName(a: Member, b: Member) {
	return a.name.localeCompare(b.name)
}

const truncate = css({
	minWidth: "0",
	maxWidth: "full",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

export function GroupMembersSheet({
	groupId,
	viewerId,
}: {
	groupId: string
	viewerId?: string
}) {
	const { data } = useQuery(
		gqlQueryOptions(GroupMembersDocument, { groupId }, { abortable: false }),
	)
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
						<MemberSection
							label="Admins"
							members={usersWithRole("ADMIN")}
							viewerId={viewerId}
						/>
						<MemberSection
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

function MemberSection({
	label,
	members,
	viewerId,
}: {
	label: string
	members: Member[]
	viewerId?: string
}) {
	if (members.length === 0) return null
	return (
		<VStack alignItems="stretch" gap="1">
			<h3
				className={css({
					paddingInline: "2.5",
					fontFamily: "mono",
					fontSize: "xs",
					letterSpacing: "wide",
					color: "fg.muted",
					textTransform: "uppercase",
				})}
			>
				{label} · {members.length}
			</h3>
			{members.map((member) => (
				<MemberRow
					key={member.id}
					member={member}
					isViewer={member.id === viewerId}
				/>
			))}
		</VStack>
	)
}

function MemberRow({
	member,
	isViewer,
}: {
	member: Member
	isViewer: boolean
}) {
	return (
		<Link
			to="/user/$username"
			params={{ username: member.username }}
			onClick={closeModal}
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				minWidth: "0",
				padding: "{spacing.2} {spacing.2.5}",
				borderRadius: "lg",
				_hover: { bg: "fg.default/10" },
			})}
		>
			<Avatar size="sm" name={member.name} />
			<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
				<span
					className={`${truncate} ${css({ fontSize: "sm", fontWeight: "medium" })}`}
				>
					{member.name}
				</span>
				<HStack gap="1.5" minWidth="0" maxWidth="full">
					<span
						className={`${truncate} ${css({ fontFamily: "mono", fontSize: "xs", color: "fg.muted" })}`}
					>
						@{member.username}
					</span>
					{isViewer && <Tag size="sm">You</Tag>}
				</HStack>
			</VStack>
		</Link>
	)
}
