import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { GroupLogo } from "#/components/ui/group-logo"

// Which group a post was made in. Only that group's members can see it.
export function PostGroupChip({
	group,
}: {
	group: { id: string; name: string; logoUrl: string | null }
}) {
	return (
		<Link
			to="/groups/$groupId"
			params={{ groupId: group.id }}
			title={`Posted in ${group.name}. Only its members can see it.`}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "1.5",
				flexShrink: 0,
				maxWidth: "40",
				padding: "{spacing.0.5} {spacing.2} {spacing.0.5} {spacing.0.5}",
				borderRadius: "md",
				bg: "bg.subtle",
				border: "1px solid {colors.border.default}",
				textStyle: "meta",
				color: "fg.muted",
				_hover: { color: "fg.default" },
			})}
		>
			<GroupLogo name={group.name} src={group.logoUrl} size="xs" />
			<span
				className={css({
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				})}
			>
				{group.name}
			</span>
		</Link>
	)
}
