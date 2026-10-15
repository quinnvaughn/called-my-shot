import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { MemberSheetRow, type SheetMember } from "./member-sheet-row"

export function MemberSheetSection({
	label,
	members,
	viewerId,
}: {
	label: string
	members: SheetMember[]
	viewerId?: string
}) {
	if (members.length === 0) return null
	return (
		<VStack alignItems="stretch" gap="1">
			<h3
				className={css({
					paddingInline: "2.5",
					textStyle: "sectionHeading",
					color: "fg.muted",
				})}
			>
				{label} · {members.length}
			</h3>
			{members.map((member) => (
				<MemberSheetRow
					key={member.id}
					member={member}
					isViewer={member.id === viewerId}
				/>
			))}
		</VStack>
	)
}
