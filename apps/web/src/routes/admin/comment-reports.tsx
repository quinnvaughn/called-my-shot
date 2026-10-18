import { PRESSER_REPORT_REASON_LABELS } from "@called-my-shot/schemas"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import {
	AdminDismissCommentReportDocument,
	AdminRemoveCommentDocument,
} from "#/graphql/admin/comment-reports/mutations"
import {
	AdminCommentReportsDocument,
	adminCommentReportsQuery,
} from "#/graphql/admin/comment-reports/queries"
import { invalidateChallenges } from "#/graphql/challenges/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"

export const Route = createFileRoute("/admin/comment-reports")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminCommentReportsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminCommentReportsQuery)
	const queryClient = useQueryClient()
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(AdminCommentReportsDocument),
		})
	const dismiss = useGqlMutation(AdminDismissCommentReportDocument)
	const remove = useGqlMutation(AdminRemoveCommentDocument)
	const reports = data.adminCommentReports

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Comment reports"
				subtitle="Comments people flagged, from challenge trash talk and chain threads. Removing takes the words and the GIF down."
			/>
			{reports.length === 0 ? (
				<EmptyState>No open comment reports.</EmptyState>
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
								{report.comment.text && (
									<p
										className={css({
											fontSize: "sm",
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere",
										})}
									>
										{report.comment.text}
									</p>
								)}
								{report.comment.gif && (
									<img
										src={report.comment.gif.url}
										alt={report.comment.gif.alt}
										className={css({ maxHeight: "40", borderRadius: "md" })}
									/>
								)}
								{report.details && (
									<p className={css({ fontSize: "xs", color: "fg.muted" })}>
										{report.details}
									</p>
								)}
								<p className={css({ fontSize: "xs", color: "fg.muted" })}>
									by @{report.comment.sender.username} · reported by @
									{report.reporter?.username ?? "deleted"}
								</p>
								{report.chainId && report.groupId && (
									<Link
										to="/groups/$groupId/chains/$chainId"
										params={{
											groupId: report.groupId,
											chainId: report.chainId,
										}}
										className={css({
											fontSize: "xs",
											color: "fg.default",
											textDecoration: "underline",
										})}
									>
										Open the chain
									</Link>
								)}
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
										await refresh()
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
										await Promise.all([
											refresh(),
											invalidateChallenges(queryClient),
										])
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
