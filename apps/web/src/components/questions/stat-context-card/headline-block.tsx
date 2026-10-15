import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import type { Headline } from "#/lib/stat-context"

// Value large in the heading face over a mono micro-label, the same hierarchy
// the profile stat tiles use. Shared by both column renderers.
export function HeadlineBlock({
	lead,
	dense,
}: {
	lead: Headline | null
	dense: boolean
}) {
	if (!lead) return null

	return (
		<VStack gap="0.5" alignItems="flex-start">
			<span
				className={css({
					fontFamily: "heading",
					fontSize: dense ? "lg" : "3xl",
					lineHeight: "1",
				})}
			>
				{lead.value}
			</span>
			<span
				className={css({
					textStyle: "labelSm",
					color: "fg.subtle",
				})}
			>
				{lead.label}
			</span>
		</VStack>
	)
}
