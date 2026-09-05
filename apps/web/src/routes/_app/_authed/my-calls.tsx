import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { MyCallsTab } from "#/components/my-calls/my-calls-tab"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { myCallsPageQuery, myCallsQuery } from "#/graphql/queries/my-calls"
import { seedInfiniteQuery } from "#/graphql/query-options"

export const Route = createFileRoute("/_app/_authed/my-calls")({
	component: RouteComponent,
	// Both tabs' first pages arrive as aliased fields of one query (see
	// MyCallsPageDocument), so they're handed straight to the infinite caches
	// the tabs paginate with rather than costing a request each.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(myCallsPageQuery)
		seedInfiniteQuery(context.queryClient, myCallsQuery("OPEN"), {
			myCalls: data.open,
		})
		seedInfiniteQuery(context.queryClient, myCallsQuery("RESOLVED"), {
			myCalls: data.resolved,
		})
	},
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"open" | "resolved">("open")
	const { data } = useSuspenseQuery(myCallsPageQuery)
	const counts = data.myCallCounts
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
				<MyCallsTab key="open" status="OPEN" />
			) : (
				<MyCallsTab key="resolved" status="RESOLVED" />
			)}
		</VStack>
	)
}
