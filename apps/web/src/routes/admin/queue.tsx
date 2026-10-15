import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { AutoResolveEscalatedSection } from "#/components/admin/admin-queue/auto-resolve-escalated-section"
import { DisputedSection } from "#/components/admin/admin-queue/disputed-section"
import { NeedsResolutionSection } from "#/components/admin/admin-queue/needs-resolution-section"
import { ProbablyStillLiveSection } from "#/components/admin/admin-queue/probably-still-live-section"
import { QueueStats } from "#/components/admin/admin-queue/queue-stats"
import { ReportedSection } from "#/components/admin/admin-queue/reported-section"
import { PageHeader } from "#/components/ui/page-header"
import { adminQueueSummaryQuery } from "#/graphql/admin/queue/queries"

export const Route = createFileRoute("/admin/queue")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminQueueSummaryQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminQueueSummaryQuery)

	const summary =
		data.adminQueueSummary.__typename === "QueryAdminQueueSummarySuccess"
			? data.adminQueueSummary.data
			: null

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Queue"
				subtitle="What actually needs your attention right now."
			/>

			<QueueStats summary={summary} />

			<NeedsResolutionSection questions={summary?.needsResolution ?? []} />

			{summary && summary.autoResolveEscalated.length > 0 && (
				<AutoResolveEscalatedSection escalated={summary.autoResolveEscalated} />
			)}

			{summary && summary.probablyStillLive.length > 0 && (
				<ProbablyStillLiveSection questions={summary.probablyStillLive} />
			)}

			{summary && summary.disputed.length > 0 && (
				<DisputedSection disputes={summary.disputed} />
			)}

			{summary && summary.reported.length > 0 && (
				<ReportedSection reports={summary.reported} />
			)}
		</VStack>
	)
}
