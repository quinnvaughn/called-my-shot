import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { FiMoreHorizontal } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Dropdown } from "#/components/ui/dropdown"
import { Tag } from "#/components/ui/tag"
import {
	RemoveGroupMemberDocument,
	SetGroupMemberRoleDocument,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { openModal } from "#/stores/modal-store"
import { ConfirmActionModal } from "./confirm-action-modal"
import type { SettingsMember } from "./settings-member"

type Props = {
	groupId: string
	groupName: string
	viewerId?: string
	members: SettingsMember[]
}

type RowAction = { label: string; danger?: boolean; onSelect: () => void }

const FALLBACK_ERROR = "Something went wrong. Try again."

const truncate = css({
	minWidth: "0",
	maxWidth: "full",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

function adminsFirst(a: SettingsMember, b: SettingsMember) {
	if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1
	return a.user.name.localeCompare(b.user.name)
}

// Admins only. Every admin can act on every other member, admins included;
// the one limit is that the group keeps at least one admin, which is why
// stepping down is only offered while someone else is an admin too.
export function GroupMembersSection({
	groupId,
	groupName,
	viewerId,
	members,
}: Props) {
	const setRole = useGqlMutation(SetGroupMemberRoleDocument)
	const removeMember = useGqlMutation(RemoveGroupMemberDocument)
	const queryClient = useQueryClient()
	const router = useRouter()
	const adminCount = members.filter((m) => m.role === "ADMIN").length

	async function refresh() {
		await queryClient.invalidateQueries()
		await router.invalidate()
	}

	async function changeRole(member: SettingsMember, role: "ADMIN" | "MEMBER") {
		const data = await setRole.mutateAsync({
			groupId,
			userId: member.user.id,
			role,
		})
		const result = data?.setGroupMemberRole
		if (result?.__typename === "GroupMember") {
			await refresh()
			return null
		}
		return result?.message ?? FALLBACK_ERROR
	}

	async function remove(member: SettingsMember) {
		const data = await removeMember.mutateAsync({
			groupId,
			userId: member.user.id,
		})
		const result = data?.removeGroupMember
		if (result?.__typename === "MutationRemoveGroupMemberSuccess") {
			await refresh()
			return null
		}
		return result?.message ?? FALLBACK_ERROR
	}

	function confirmRemove(member: SettingsMember) {
		openModal(
			<ConfirmActionModal
				title="Remove from group"
				confirmLabel="Remove"
				danger
				onConfirm={() => remove(member)}
			>
				@{member.user.username} loses access to {groupName} and their invite
				link stops working. Anyone in the group can invite them back.
			</ConfirmActionModal>,
		)
	}

	function actionsFor(member: SettingsMember): RowAction[] {
		const isViewer = member.user.id === viewerId
		if (isViewer) {
			if (member.role !== "ADMIN" || adminCount < 2) return []
			return [
				{
					label: "Step down as admin",
					onSelect: () =>
						openModal(
							<ConfirmActionModal
								title="Step down as admin"
								confirmLabel="Step down"
								onConfirm={() => changeRole(member, "MEMBER")}
							>
								You'll stop being an admin of {groupName}. Another admin would
								have to make you one again.
							</ConfirmActionModal>,
						),
				},
			]
		}
		const roleAction: RowAction =
			member.role === "ADMIN"
				? {
						label: "Remove as admin",
						onSelect: () =>
							openModal(
								<ConfirmActionModal
									title="Remove as admin"
									confirmLabel="Remove as admin"
									onConfirm={() => changeRole(member, "MEMBER")}
								>
									@{member.user.username} stays in {groupName} but can no longer
									edit it, manage members, or delete it.
								</ConfirmActionModal>,
							),
					}
				: {
						label: "Make admin",
						onSelect: () =>
							openModal(
								<ConfirmActionModal
									title="Make admin"
									confirmLabel="Make admin"
									onConfirm={() => changeRole(member, "ADMIN")}
								>
									@{member.user.username} will be able to edit {groupName},
									remove members, reset invite links, and delete the group.
								</ConfirmActionModal>,
							),
					}
		return [
			roleAction,
			{
				label: "Remove from group",
				danger: true,
				onSelect: () => confirmRemove(member),
			},
		]
	}

	return (
		// Visible overflow so a row's action menu isn't clipped by the card.
		<Card className={css({ overflow: "visible" })}>
			<Card.Body>
				<VStack alignItems="stretch" gap="1">
					{[...members].sort(adminsFirst).map((member) => (
						<MemberRow
							key={member.user.id}
							member={member}
							isViewer={member.user.id === viewerId}
							actions={actionsFor(member)}
						/>
					))}
				</VStack>
			</Card.Body>
		</Card>
	)
}

function MemberRow({
	member,
	isViewer,
	actions,
}: {
	member: SettingsMember
	isViewer: boolean
	actions: RowAction[]
}) {
	return (
		<HStack gap="3" minWidth="0" paddingBlock="2">
			<Avatar size="sm" name={member.user.name} src={member.user.avatarUrl} />
			<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
				<span
					className={`${truncate} ${css({ fontSize: "sm", fontWeight: "medium" })}`}
				>
					{member.user.name}
				</span>
				<HStack gap="1.5" minWidth="0" maxWidth="full">
					<span
						className={`${truncate} ${css({ fontFamily: "mono", fontSize: "xs", color: "fg.muted" })}`}
					>
						@{member.user.username}
					</span>
					{member.role === "ADMIN" && (
						<Tag size="sm" variant="primary">
							Admin
						</Tag>
					)}
					{isViewer && <Tag size="sm">You</Tag>}
				</HStack>
			</VStack>
			{actions.length > 0 && (
				<Dropdown>
					<Dropdown.Trigger
						aria-label={`Manage @${member.user.username}`}
						className={css({
							display: "flex",
							padding: "2",
							borderRadius: "md",
							color: "fg.muted",
							_hover: { bg: "fg.default/10", color: "fg.default" },
						})}
					>
						<FiMoreHorizontal size={16} />
					</Dropdown.Trigger>
					<Dropdown.Content>
						{actions.map((action) => (
							<Dropdown.Item
								key={action.label}
								onClick={action.onSelect}
								className={
									action.danger ? css({ color: "danger.default" }) : undefined
								}
							>
								{action.label}
							</Dropdown.Item>
						))}
					</Dropdown.Content>
				</Dropdown>
			)}
		</HStack>
	)
}
