import { css } from "styled-system/css"
import { SpaceSectionLink } from "./space-section-link"
import type { SpaceSection } from "./space-sections"

export function SpaceSectionList({
	sections,
	onNavigate,
}: {
	sections: SpaceSection[]
	onNavigate?: () => void
}) {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "0.5" })}
		>
			{sections.map((section) => (
				<SpaceSectionLink
					key={section.label}
					section={section}
					onNavigate={onNavigate}
				/>
			))}
		</div>
	)
}
