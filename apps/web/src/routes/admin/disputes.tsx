import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { OverturnDisputeModal } from "#/components/admin/overturn-dispute-modal"
import { VoidQuestionModal } from "#/components/admin/void-question-modal"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { useGqlMutation } from "#/graphql/hooks"
import { UpholdDisputeDocument } from "#/graphql/mutations/admin"
import { AdminDisputesDocument } from "#/graphql/queries/admin"
import { gqlQueryOptions } from "#/graphql/query-options"
import { safeExternalUrl } from "#/lib/external-url"
import { isRateStat } from "#/lib/field-signal"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/disputes")({
	component: RouteComponent,
})

function UpholdButton({
	disputeId,
	onUpheld,
}: {
	disputeId: string
	onUpheld: () => void
}) {
	const upholdDispute = useGqlMutation(UpholdDisputeDocument)

	return (
		<Button
			variant="outline"
			size="sm"
			loading={upholdDispute.isPending}
			onClick={async () => {
				const data = await upholdDispute.mutateAsync({ input: { disputeId } })
				if (data?.upholdDispute.__typename === "ResolutionDispute") onUpheld()
			}}
		>
			Uphold
		</Button>
	)
}

function RouteComponent() {
	const { data, refetch } = useQuery(gqlQueryOptions(AdminDisputesDocument, {}))

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
				<EmptyState>No open disputes: you're all caught up.</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{disputes.map((dispute) => {
						const sourceUrl = safeExternalUrl(
							dispute.question.resolutionSourceUrl,
						)
						return (
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
											to="/questions/$questionId/{-$slug}"
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
											className={css({
												fontSize: "sm",
												fontWeight: "semibold",
											})}
										>
											{resolvedAnswerSummary(dispute.question) ??
												"No recorded outcome"}
										</span>
										{dispute.question.resolutionNote && (
											<p className={css({ fontSize: "xs", color: "fg.muted" })}>
												{dispute.question.resolutionNote}
											</p>
										)}
										{sourceUrl ? (
											<a
												href={sourceUrl}
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
											"{dispute.reason}" · @{dispute.user.username}
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
																dispute.question.shape.toLowerCase() as QuestionCallShape,
															ouLine: dispute.question.ouLine ?? null,
															options: dispute.question.options,
															isRateStat: isRateStat(dispute.question),
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
						)
					})}
				</VStack>
			)}
		</VStack>
	)
}
