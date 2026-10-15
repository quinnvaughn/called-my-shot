import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { HowItWorksSections } from "#/components/how-it-works/how-it-works-sections"
import { PageHeader } from "#/components/ui/page-header"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/how-it-works")({
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "How it works · Called My Shot",
			description:
				"How conviction, contrarian tiers and scoring work - what a call costs, what it pays, and how points move when a question resolves.",
			path: "/how-it-works",
		}),
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
