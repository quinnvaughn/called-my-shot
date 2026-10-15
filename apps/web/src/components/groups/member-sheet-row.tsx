import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import { closeModal } from "#/stores/modal-store"

export type SheetMember = {
	id: string
	name: string
	username: string
	avatarUrl: string | null
}

export function MemberSheetRow({
	member,
	isViewer,
}: {
	member: SheetMember
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
			<Identity
				layout="stacked"
				size="sm"
				name={member.name}
				username={member.username}
				avatarUrl={member.avatarUrl}
				badges={isViewer && <Tag size="sm">You</Tag>}
			/>
		</Link>
	)
}
