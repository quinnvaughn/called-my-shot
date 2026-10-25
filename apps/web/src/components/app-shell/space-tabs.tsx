import { css } from "styled-system/css"
import { CountBadge } from "#/components/ui/count-badge"
import { Tabs } from "#/components/ui/tabs"
import type { Space } from "./space"
import { spaceTabSections } from "./space-sections"
import type { Me } from "./types"

// The current space's sections as a row above the page, below md only: the
// side column's job on a screen with no room for it.
export function SpaceTabs({ me, space }: { me: Me; space: Space }) {
	const sections = spaceTabSections(space, me)
	if (sections.length === 0) return null

	return (
		<div
			className={css({
				display: { base: "block", md: "none" },
				marginBottom: "5",
			})}
		>
			<Tabs.List variant="pill" aria-label="Sections">
				{sections.map((section) => (
					<Tabs.LinkTrigger
						key={section.label}
						to={section.to}
						search={section.search}
						activeOptions={{
							exact: section.exact ?? false,
							includeSearch: !!section.search,
						}}
					>
						{section.label}
						{section.badge !== undefined && (
							<CountBadge count={section.badge} />
						)}
					</Tabs.LinkTrigger>
				))}
			</Tabs.List>
		</div>
	)
}
