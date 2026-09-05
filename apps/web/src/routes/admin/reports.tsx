import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { VoidQuestionModal } from "#/components/admin/void-question-modal"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { useGqlMutation } from "#/graphql/hooks"
import { DismissReportDocument } from "#/graphql/mutations/admin"
import { AdminReportsDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { VOID_REASON_LABELS } from "#/lib/admin/void-defaults"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/reports")({
	component: RouteComponent,
})

function DismissButton({
	reportId,
	onDismissed,
}: {
	reportId: string
	onDismissed: () => void
}) {
	const dismissReport = useGqlMutation(DismissReportDocument)

	return (
		<Button
			variant="outline"
			size="sm"
			loading={dismissReport.isPending}
			onClick={async () => {
				const data = await dismissReport.mutateAsync({ input: { reportId } })
				if (data?.dismissReport.__typename === "QuestionReport") onDismissed()
			}}
		>
			Dismiss
		</Button>
	)
}

function RouteComponent() {
	const { data, refetch } = useQuery(gqlQueryOptions(AdminReportsDocument, {}))

	const reports =
		data?.adminQueueSummary.__typename === "QueryAdminQueueSummarySuccess"
			? data.adminQueueSummary.data.reported
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Reports" subtitle="Questions callers flagged as bad." />

			{reports.length === 0 ? (
				<EmptyState>No open reports: you're all caught up.</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{reports.map((report) => (
						<VStack
							key={report.id}
							gap="2"
							alignItems="stretch"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "4",
							})}
						>
							<HStack justify="space-between" gap="4" alignItems="flex-start">
								<VStack
									gap="2"
									alignItems="flex-start"
									className={css({ minWidth: 0 })}
								>
									<Link
										to="/questions/$questionId"
										params={{ questionId: report.question.id }}
										className={css({
											fontSize: "sm",
											fontWeight: "medium",
											color: "fg.default",
											textDecoration: "underline",
										})}
									>
										{report.question.title}
									</Link>
									<span
										className={css({ fontSize: "sm", fontWeight: "semibold" })}
									>
										{VOID_REASON_LABELS[report.reason]}
									</span>
									{report.details && (
										<p className={css({ fontSize: "xs", color: "fg.muted" })}>
											{report.details}
										</p>
									)}
									<p className={css({ fontSize: "xs", color: "fg.muted" })}>
										reported by @{report.reportedBy.username}
									</p>
								</VStack>
								<HStack gap="1.5" flexShrink={0}>
									<DismissButton
										reportId={report.id}
										onDismissed={() => refetch()}
									/>
									<Button
										variant="outline"
										size="sm"
										className={css({ color: "danger.default" })}
										onClick={() =>
											openModal(
												<VoidQuestionModal
													question={{
														id: report.question.id,
														title: report.question.title,
														creator: report.question.creator,
													}}
													onVoided={() => refetch()}
												/>,
											)
										}
									>
										Void
									</Button>
								</HStack>
							</HStack>
						</VStack>
					))}
				</VStack>
			)}
		</VStack>
	)
}
