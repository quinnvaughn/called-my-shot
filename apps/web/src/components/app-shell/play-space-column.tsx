import { css } from "styled-system/css"
import { SpaceColumnHeader } from "./space-column-header"
import { SpaceSectionList } from "./space-section-list"
import { playSections } from "./space-sections"

export function PlaySpaceColumn() {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<SpaceColumnHeader title="Play" subtitle="Daily games" />
			<SpaceSectionList sections={playSections} />
		</div>
	)
}
