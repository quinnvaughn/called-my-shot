import { FiMoreHorizontal } from "react-icons/fi"
import { css } from "styled-system/css"
import { Dropdown } from "#/components/ui/dropdown"

export type PresserMenuAction = {
	label: string
	danger?: boolean
	onSelect: () => void
}

export function PresserMenu({
	label,
	actions,
}: {
	label: string
	actions: PresserMenuAction[]
}) {
	if (actions.length === 0) return null
	return (
		<Dropdown>
			<Dropdown.Trigger
				aria-label={label}
				className={css({
					display: "flex",
					padding: "1.5",
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
	)
}
