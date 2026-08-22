import { useMutation, useQuery } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { OverturnDisputeModal } from "#/components/admin/overturn-dispute-modal"
import { VoidQuestionModal } from "#/components/admin/void-question-modal"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { UpholdDisputeDocument } from "#/graphql/mutations/admin"
import { AdminDisputesDocument } from "#/graphql/queries/admin"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/disputes")({
	component: RouteComponent,
})

type QuestionShape =
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "player_vs_player"
	| "team_vs_team"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"

function UpholdButton({
	disputeId,
	onUpheld,
}: {
	disputeId: string
	onUpheld: () => void
}) {
	const [upholdDispute, { loading }] = useMutation(UpholdDisputeDocument)

	return (
		<Button
			variant="outline"
			size="sm"
			loading={loading}
			onClick={async () => {
				const { data } = await upholdDispute({
					variables: { input: { disputeId } },
				})
				if (data?.upholdDispute.__typename === "ResolutionDispute") onUpheld()
			}}
		>
			Uphold
		</Button>
	)
}

function RouteComponent() {
	const { data, refetch } = useQuery(AdminDisputesDocument)

	const disputes =
		data?.adminQueueSummary.__typename === "QueryAdminQueueSummarySuccess"
			? data.adminQueueSummary.data.disputed
			: []

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Disputes"
				subtitle="Resolutions a caller flagged as wrong."
			/>

			{disputes.length === 0 ? (
				<EmptyState>No open disputes — you're all caught up.</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{disputes.map((dispute) => (
						<VStack
							key={dispute.id}
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
										params={{ questionId: dispute.question.id }}
										className={css({
											fontSize: "sm",
											fontWeight: "medium",
											color: "fg.default",
											textDecoration: "underline",
										})}
									>
										{dispute.question.title}
									</Link>
									<span
										className={css({ fontSize: "sm", fontWeight: "semibold" })}
									>
										{resolvedAnswerSummary(dispute.question) ??
											"No recorded outcome"}
									</span>
									{dispute.question.resolutionNote && (
										<p className={css({ fontSize: "xs", color: "fg.muted" })}>
											{dispute.question.resolutionNote}
										</p>
									)}
									{dispute.question.resolutionSourceUrl ? (
										<a
											href={dispute.question.resolutionSourceUrl}
											target="_blank"
											rel="noreferrer"
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												color: "fg.subtle",
												textDecoration: "underline",
											})}
										>
											{dispute.question.resolutionSource || "Source"}
										</a>
									) : (
										dispute.question.resolutionSource && (
											<span
												className={css({
													fontFamily: "mono",
													fontSize: "2xs",
													color: "fg.subtle",
												})}
											>
												{dispute.question.resolutionSource}
											</span>
										)
									)}
									<p className={css({ fontSize: "xs", color: "fg.muted" })}>
										"{dispute.reason}" — @{dispute.user.username}
									</p>
								</VStack>
								<HStack gap="1.5" flexShrink={0}>
									<UpholdButton
										disputeId={dispute.id}
										onUpheld={() => refetch()}
									/>
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											openModal(
												<OverturnDisputeModal
													disputeId={dispute.id}
													question={{
														id: dispute.question.id,
														title: dispute.question.title,
														shape:
															dispute.question.shape.toLowerCase() as QuestionShape,
														ouLine: dispute.question.ouLine ?? null,
														options: dispute.question.options,
													}}
													onOverturned={() => refetch()}
												/>,
											)
										}
									>
										Overturn
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={css({ color: "danger.default" })}
										onClick={() =>
											openModal(
												<VoidQuestionModal
													question={{
														id: dispute.question.id,
														title: dispute.question.title,
														creator: { username: dispute.user.username },
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
