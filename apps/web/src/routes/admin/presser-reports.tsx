import { PRESSER_REPORT_REASON_LABELS } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import type { PresserReportTarget } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AdminDismissPresserReportDocument,
	AdminRemovePresserContentDocument,
} from "#/graphql/mutations/pressers"
import { AdminPresserReportsDocument } from "#/graphql/queries/pressers"
import { gqlQueryOptions } from "#/graphql/query-options"

export const Route = createFileRoute("/admin/presser-reports")({
	component: RouteComponent,
})

const TARGET_LABELS: Record<PresserReportTarget, string> = {
	QUESTION: "Question",
	ANSWER: "Answer",
	STATEMENT: "Statement",
}

function RouteComponent() {
	const { data, refetch } = useQuery(
		gqlQueryOptions(AdminPresserReportsDocument, {}),
	)
	const dismiss = useGqlMutation(AdminDismissPresserReportDocument)
	const remove = useGqlMutation(AdminRemovePresserContentDocument)
	const reports = data?.adminPresserReports ?? []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Presser reports"
				subtitle="Questions, answers and statements people flagged. Removing takes the whole Q&A down."
			/>
			{reports.length === 0 ? (
				<EmptyState>No open presser reports.</EmptyState>
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
									<span
										className={css({ fontSize: "sm", fontWeight: "semibold" })}
									>
										{TARGET_LABELS[report.target]} ·{" "}
										{
											PRESSER_REPORT_REASON_LABELS[
												report.reason.toLowerCase() as keyof typeof PRESSER_REPORT_REASON_LABELS
											]
										}
									</span>
									{report.questionBody && (
										<p className={css({ fontSize: "xs", color: "fg.muted" })}>
											Asked: {report.questionBody}
										</p>
									)}
									<p
										className={css({
											fontSize: "sm",
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere",
										})}
									>
										{report.reportedText}
									</p>
									{report.details && (
										<p className={css({ fontSize: "xs", color: "fg.muted" })}>
											{report.details}
										</p>
									)}
									<p className={css({ fontSize: "xs", color: "fg.muted" })}>
										{report.author ? `by @${report.author.username} · ` : ""}
										reported by @{report.reporter?.username ?? "deleted"}
									</p>
									{report.presser && (
										<Link
											to="/games/$gameId/picks/$username"
											params={{
												gameId: report.presser.game.id,
												username: report.presser.owner.username,
											}}
											hash="presser"
											className={css({
												fontSize: "xs",
												color: "fg.default",
												textDecoration: "underline",
											})}
										>
											Open the presser
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
						</VStack>
					))}
				</VStack>
			)}
		</VStack>
	)
}
