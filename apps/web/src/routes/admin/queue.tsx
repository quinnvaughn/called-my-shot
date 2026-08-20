import { useQuery } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { ResolveButton } from "#/components/admin/question-row-actions"
import { VoidQuestionModal } from "#/components/admin/void-question-modal"
import { Button, button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { AdminQueueSummaryDocument } from "#/graphql/queries/admin"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/queue")({
	component: RouteComponent,
})

function StatCard({ value, label }: { value: number; label: string }) {
	return (
		<VStack
			alignItems="flex-start"
			gap="1"
			className={css({
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				padding: "4",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xl",
					fontWeight: "semibold",
				})}
			>
				{value}
			</span>
			<span className={css({ fontSize: "xs", color: "fg.muted" })}>
				{label}
			</span>
		</VStack>
	)
}

function timeAgo(iso: string) {
	const ms = Date.now() - new Date(iso).getTime()
	const hours = Math.floor(ms / (1000 * 60 * 60))
	const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
	if (hours <= 0) return `${minutes}m ago`
	return `${hours}h ${minutes}m ago`
}

function RouteComponent() {
	const { data, refetch } = useQuery(AdminQueueSummaryDocument)

	const summary =
		data?.adminQueueSummary.__typename === "QueryAdminQueueSummarySuccess"
			? data.adminQueueSummary.data
			: null

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Queue"
				subtitle="What actually needs your attention right now."
			/>

			<Grid
				gridTemplateColumns={{ base: "1fr 1fr", md: "repeat(5, 1fr)" }}
				gap="3"
			>
				<StatCard
					value={summary?.needsResolution.length ?? 0}
					label="Needs resolution"
				/>
				<StatCard value={summary?.disputed.length ?? 0} label="Disputed" />
				<StatCard value={summary?.reported.length ?? 0} label="Reported" />
				<StatCard value={summary?.usersLockedCount ?? 0} label="Users locked" />
				<StatCard
					value={summary?.liveQuestionsCount ?? 0}
					label="Live questions"
				/>
			</Grid>

			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					Locked a while — likely over (estimate)
				</span>
				{!summary || summary.needsResolution.length === 0 ? (
					<EmptyState>Nothing needs resolving right now.</EmptyState>
				) : (
					summary.needsResolution.map((question) => (
						<HStack
							key={question.id}
							justify="space-between"
							gap="4"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "3.5",
							})}
						>
							<VStack
								gap="1"
								alignItems="flex-start"
								className={css({ minWidth: 0 })}
							>
								<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
									{question.title}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										color: "danger.default",
									})}
								>
									locked {timeAgo(question.locksAt)} · {question.callCount}{" "}
									callers
								</span>
							</VStack>
							<HStack gap="1.5" flexShrink={0}>
								<ResolveButton
									questionId={question.id}
									onResolved={() => refetch()}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<VoidQuestionModal
												question={question}
												onVoided={() => refetch()}
											/>,
										)
									}
								>
									Void
								</Button>
							</HStack>
						</HStack>
					))
				)}
			</VStack>

			{summary && summary.probablyStillLive.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						Locked recently — probably still live (estimate)
					</span>
					{summary.probablyStillLive.map((question) => (
						<HStack
							key={question.id}
							justify="space-between"
							gap="4"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "3.5",
							})}
						>
							<VStack gap="1" alignItems="flex-start">
								<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
									{question.title}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										color: "fg.subtle",
									})}
								>
									locked {timeAgo(question.locksAt)} · {question.callCount}{" "}
									callers
								</span>
							</VStack>
						</HStack>
					))}
				</VStack>
			)}

			{summary && summary.disputed.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						Disputed
					</span>
					{summary.disputed.map((dispute) => (
						<HStack
							key={dispute.id}
							justify="space-between"
							gap="4"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "3.5",
							})}
						>
							<VStack
								gap="1"
								alignItems="flex-start"
								className={css({ minWidth: 0 })}
							>
								<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
									{dispute.question.title}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										color: "fg.subtle",
									})}
								>
									@{dispute.user.username} · {timeAgo(dispute.createdAt)}
								</span>
							</VStack>
							<Link
								to="/admin/disputes"
								className={button({ variant: "outline", size: "sm" })}
							>
								Review
							</Link>
						</HStack>
					))}
				</VStack>
			)}

			{summary && summary.reported.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						Reported
					</span>
					{summary.reported.map((report) => (
						<HStack
							key={report.id}
							justify="space-between"
							gap="4"
							className={css({
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "xl",
								padding: "3.5",
							})}
						>
							<VStack
								gap="1"
								alignItems="flex-start"
								className={css({ minWidth: 0 })}
							>
								<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
									{report.question.title}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										color: "fg.subtle",
									})}
								>
									@{report.reportedBy.username} · {timeAgo(report.createdAt)}
								</span>
							</VStack>
							<Link
								to="/admin/reports"
								className={button({ variant: "outline", size: "sm" })}
							>
								Review
							</Link>
						</HStack>
					))}
				</VStack>
			)}
		</VStack>
	)
}
