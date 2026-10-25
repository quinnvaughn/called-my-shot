import { css } from "styled-system/css"
import { SidebarSection } from "./sidebar-section"
import { SpaceColumnHeader } from "./space-column-header"
import { SpaceSectionList } from "./space-section-list"
import { homeSections, resourceSections, youSections } from "./space-sections"
import type { Me } from "./types"

export function HomeSpaceColumn({ me }: { me: Me }) {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<SpaceColumnHeader
				title="Home"
				subtitle={me ? `@${me.username}` : undefined}
			/>
			<SpaceSectionList sections={homeSections} />
			{me && (
				<SidebarSection id="you" label="YOU">
					<SpaceSectionList sections={youSections(me.username)} />
				</SidebarSection>
			)}
			<SidebarSection id="resources" label="RESOURCES">
				<SpaceSectionList sections={resourceSections(!!me)} />
			</SidebarSection>
		</div>
	)
}
