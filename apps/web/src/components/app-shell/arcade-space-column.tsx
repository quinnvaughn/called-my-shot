import { css } from "styled-system/css"
import { SpaceColumnHeader } from "./space-column-header"
import { SpaceSectionList } from "./space-section-list"
import { arcadeSections } from "./space-sections"

export function ArcadeSpaceColumn() {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<SpaceColumnHeader title="Arcade" subtitle="Sports games" />
			<SpaceSectionList sections={arcadeSections} />
		</div>
	)
}
