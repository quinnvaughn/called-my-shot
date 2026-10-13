import { PRESSER_REPORT_REASON_LABELS } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AdminDismissGloatReportDocument,
	AdminGloatReportsDocument,
	AdminRemoveGloatDocument,
} from "#/graphql/queries/admin-gloats"
import { gqlQueryOptions } from "#/graphql/query-options"

export const Route = createFileRoute("/admin/gloat-reports")({
	component: RouteComponent,
})

function RouteComponent() {
	const { data, refetch } = useQuery(
		gqlQueryOptions(AdminGloatReportsDocument, {}),
	)
	const dismiss = useGqlMutation(AdminDismissGloatReportDocument)
	const remove = useGqlMutation(AdminRemoveGloatDocument)
	const reports = data?.adminGloatReports ?? []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Trash talk reports"
				subtitle="Trash talk people flagged after a challenge. Removing takes the words and the GIF down."
			/>
			{reports.length === 0 ? (
				<EmptyState>No open trash talk reports.</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{reports.map((report) => (
						<HStack
							key={report.id}
							justify="space-between"
							gap="4"
							alignItems="flex-start"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "4",
							})}
						>
							<VStack gap="2" alignItems="flex-start" minWidth="0">
								<span
									className={css({ fontSize: "sm", fontWeight: "semibold" })}
								>
									{
										PRESSER_REPORT_REASON_LABELS[
											report.reason.toLowerCase() as keyof typeof PRESSER_REPORT_REASON_LABELS
										]
									}
								</span>
								{report.gloat.text && (
									<p
										className={css({
											fontSize: "sm",
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere",
										})}
									>
										{report.gloat.text}
									</p>
								)}
								{report.gloat.gif && (
									<img
										src={report.gloat.gif.url}
										alt={report.gloat.gif.alt}
										className={css({ maxHeight: "40", borderRadius: "md" })}
									/>
								)}
								{report.details && (
									<p className={css({ fontSize: "xs", color: "fg.muted" })}>
										{report.details}
									</p>
								)}
								<p className={css({ fontSize: "xs", color: "fg.muted" })}>
									by @{report.gloat.sender.username} · reported by @
									{report.reporter?.username ?? "deleted"}
								</p>
								{report.challengeCode && (
									<Link
										to="/challenges/$code"
										params={{ code: report.challengeCode }}
										className={css({
											fontSize: "xs",
											color: "fg.default",
											textDecoration: "underline",
										})}
									>
										Open the challenge
									</Link>
								)}
							</VStack>
							<HStack gap="1.5" flexShrink={0}>
								<Button
									variant="outline"
									size="sm"
									loading={dismiss.isPending}
									onClick={async () => {
										await dismiss.mutateAsync({ reportId: report.id })
										await refetch()
									}}
								>
									Dismiss
								</Button>
								<Button
									variant="outline"
									size="sm"
									className={css({ color: "danger.default" })}
									loading={remove.isPending}
									onClick={async () => {
										await remove.mutateAsync({ reportId: report.id })
										await refetch()
									}}
								>
									Remove
								</Button>
							</HStack>
						</HStack>
					))}
				</VStack>
			)}
		</VStack>
	)
}
