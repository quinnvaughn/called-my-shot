import { css } from "styled-system/css"
import { pluralize } from "#/lib/pluralize"
import { SpaceColumnHeader } from "./space-column-header"
import { SpaceSectionList } from "./space-section-list"
import { groupSections } from "./space-sections"
import { useGroupSpace } from "./use-group-space"

export function GroupSpaceColumn({ groupId }: { groupId: string }) {
	const group = useGroupSpace(groupId)
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<SpaceColumnHeader
				title={group.name ?? "Group"}
				subtitle={
					group.memberCount !== null
						? `${group.memberCount} ${pluralize(group.memberCount, "member")}`
						: undefined
				}
			/>
			<SpaceSectionList sections={groupSections(groupId, group.sectionShell)} />
		</div>
	)
}
