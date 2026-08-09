import type { ReactNode } from "react"
import { VStack } from "styled-system/jsx"
import { LandingPageSection } from "./landing-page-section"
import { LandingPageSectionHeader } from "./landing-page-section-header"
import { LandingPageWrap } from "./landing-page-wrap"

type Props = {
	eyebrow: string
	title: string
	description: string
	alt?: boolean
	id?: string
	center?: boolean
	children: ReactNode
}

export function LandingPageContentSection({
	eyebrow,
	title,
	description,
	alt,
	id,
	center,
	children,
}: Props) {
	return (
		<LandingPageSection alt={alt} id={id}>
			<LandingPageWrap>
				<VStack alignItems={center ? "center" : "flex-start"} gap="10">
					<LandingPageSectionHeader
						eyebrow={eyebrow}
						title={title}
						description={description}
						center={center}
					/>
					{children}
				</VStack>
			</LandingPageWrap>
		</LandingPageSection>
	)
}
