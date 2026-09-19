import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { Card } from "../ui/card"
import { LandingPageContentSection } from "./landing-page-content-section"

type FeatureItem = {
	icon: ReactNode
	title: string
	description: string
	example?: string
}

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

function FeatureCard({ icon, title, description, example }: FeatureItem) {
	return (
		<Card>
			<Card.Body>
				<VStack alignItems="flex-start" gap="3.5">
					<div
						className={css({
							width: "9",
							height: "9",
							borderRadius: "lg",
							bg: "primary.subtle",
							color: "primary.default",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: "0",
						})}
					>
						{icon}
					</div>
					<div className={css({ fontWeight: "semibold" })}>{title}</div>
					<div
						className={css({
							color: "fg.muted",
							fontSize: "sm",
							lineHeight: "relaxed",
						})}
					>
						{description}
					</div>
					{example && (
						<div
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.subtle",
								borderTop: "1px solid {border.default}",
								paddingTop: "3",
								width: "full",
							})}
						>
							{example}
						</div>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}
