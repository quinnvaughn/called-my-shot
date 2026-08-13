import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { MyCallsTab } from "#/components/my-calls/my-calls-tab"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { MyCallsPageDocument } from "#/graphql/queries/my-calls"

export const Route = createFileRoute("/_app/_authed/my-calls")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: MyCallsPageDocument,
		})
		return {
			counts: data?.myCallCounts ?? { open: 0, resolved: 0 },
			open: data?.open ?? {
				items: [],
				pageInfo: { hasNextPage: false, endCursor: null },
			},
			resolved: data?.resolved ?? {
				items: [],
				pageInfo: { hasNextPage: false, endCursor: null },
			},
		}
	},
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"open" | "resolved">("open")
	const { counts, open, resolved } = Route.useLoaderData()
	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Calls"
				subtitle="Every call you've made, open and resolved"
			/>
			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<Tabs.List>
					<Tabs.Trigger value="open">Open ({counts.open})</Tabs.Trigger>
					<Tabs.Trigger value="resolved">
						Resolved ({counts.resolved})
					</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
			{activeTab === "open" ? (
				<MyCallsTab
					key="open"
					status="OPEN"
					initialItems={open.items}
					initialPageInfo={open.pageInfo}
				/>
			) : (
				<MyCallsTab
					key="resolved"
					status="RESOLVED"
					initialItems={resolved.items}
					initialPageInfo={resolved.pageInfo}
				/>
			)}
		</VStack>
	)
}
