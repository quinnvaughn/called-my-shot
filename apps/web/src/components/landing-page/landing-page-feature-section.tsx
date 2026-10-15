import { css } from "styled-system/css"
import { Grid } from "styled-system/jsx"
import { FeatureCard, type FeatureItem } from "./feature-card"
import { LandingPageContentSection } from "./landing-page-content-section"

type Props = {
	eyebrow: string
	title: string
	description: string
	items: FeatureItem[]
	columns?: 2 | 3 | 4
	alt?: boolean
	id?: string
}

// Each column count needs its own literal css() call: Panda extracts styles
// statically, so a breakpoint map built at runtime generates no CSS and the
// grid silently falls back to a single column.
const columnStyles = {
	2: css({ gridTemplateColumns: { base: "1fr", md: "repeat(2, 1fr)" } }),
	// Three go wide at lg rather than xl, since a 2+1 orphan row is the only
	// other option and there's room for three across at 1024.
	3: css({
		gridTemplateColumns: { base: "1fr", md: "1fr 1fr", lg: "repeat(3, 1fr)" },
	}),
	4: css({
		gridTemplateColumns: { base: "1fr", md: "1fr 1fr", xl: "repeat(4, 1fr)" },
	}),
}

export function LandingPageFeatureSection({
	items,
	columns = 4,
	...headerProps
}: Props) {
	return (
		<LandingPageContentSection {...headerProps}>
			<Grid className={columnStyles[columns]} gap="5" width="full">
				{items.map((item) => (
					<FeatureCard {...item} key={item.title} />
				))}
			</Grid>
		</LandingPageContentSection>
	)
}
