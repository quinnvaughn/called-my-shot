import { FiMoreHorizontal } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Dropdown } from "#/components/ui/dropdown"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import type { SettingsMember } from "./settings-member"

export type RowAction = {
	label: string
	danger?: boolean
	onSelect: () => void
}

export function SettingsMemberRow({
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
			<Identity
				layout="stacked"
				size="sm"
				name={member.user.name}
				username={member.user.username}
				avatarUrl={member.user.avatarUrl}
				badges={
					<>
						{member.role === "ADMIN" && (
							<Tag size="sm" variant="primary">
								Admin
							</Tag>
						)}
						{isViewer && <Tag size="sm">You</Tag>}
					</>
				}
			/>
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
