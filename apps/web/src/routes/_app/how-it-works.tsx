import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { HowItWorksSections } from "#/components/how-it-works/how-it-works-content"
import { PageHeader } from "#/components/ui/page-header"

export const Route = createFileRoute("/_app/how-it-works")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<VStack gap="6" alignItems="stretch" maxWidth="2xl">
			<PageHeader
				title="How it works"
				subtitle="Conviction, contrarian tiers, and exactly how points move when a question resolves."
			/>
			<HowItWorksSections />
		</VStack>
	)
}
