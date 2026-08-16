import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CastCallForm } from "#/components/questions/cast-call-form"
import { DisputeModal } from "#/components/questions/dispute-modal"
import { GuessDistributionChart } from "#/components/questions/guess-distribution-chart"
import { PanelRow } from "#/components/questions/panel-row"
import { QuestionCallsList } from "#/components/questions/question-calls-list"
import { ResolutionBanner } from "#/components/questions/resolution-banner"
import { ResolveQuestionModal } from "#/components/questions/resolve-question-modal"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import {
	QuestionCallsDocument,
	QuestionDetailDocument,
} from "#/graphql/queries/question"
import { convictionSummary, pickSummary, resultState } from "#/lib/call-summary"
import { fieldSignal, resolvedFieldSignal } from "#/lib/field-signal"
import { questionDetailState } from "#/lib/question-detail-state"
import { questionCategoryLabel } from "#/lib/question-labels"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/_app/_authed/questions/$questionId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const [detail, calls] = await Promise.all([
			context.apolloClient.query({
				query: QuestionDetailDocument,
				variables: { id: params.questionId },
			}),
			context.apolloClient.query({
				query: QuestionCallsDocument,
				variables: { id: params.questionId },
			}),
		])
		return {
			question: detail.data?.question ?? null,
			calls: calls.data?.question?.calls ?? {
				items: [],
				pageInfo: { hasNextPage: false, endCursor: null },
			},
		}
	},
})

function RouteComponent() {
	const { question, calls } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

	if (!question) {
		return <EmptyState>This question doesn't exist.</EmptyState>
	}

	const state = questionDetailState(question)
	const isCreator = me?.id === question.creator.id
	const answer = state.isSettled ? resolvedAnswerSummary(question) : null
	const viewerCall = question.viewerCall
	const result = viewerCall ? resultState(viewerCall.totalPoints) : null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Link
				to="/home"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
					_hover: { color: "fg.muted" },
				})}
			>
				← Back
			</Link>

			<VStack gap="3" alignItems="stretch">
				<HStack gap="2" flexWrap="wrap">
					{question.isOfficial && <Tag variant="primary">Official</Tag>}
					<Tag>{question.league.abbreviation}</Tag>
					<Tag>{questionCategoryLabel[question.category]}</Tag>
					{question.subjectTeam && (
						<TeamBadge
							abbreviation={question.subjectTeam.abbreviation}
							color={question.subjectTeam.color}
						/>
					)}
				</HStack>
				<Link
					to="/user/$username"
					params={{ username: question.creator.username }}
					className={css({ display: "inline-flex", width: "fit-content" })}
				>
					<Identity
						name={question.creator.name}
						username={question.creator.username}
					/>
				</Link>
				<h1 className={css({ fontSize: "2xl", fontFamily: "heading" })}>
					{question.title}
				</h1>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					{state.isSettled
						? resolvedFieldSignal(question)
						: fieldSignal(question)}
				</span>
				{answer && (
					<ResolutionBanner
						answer={answer}
						note={question.resolutionNote}
						disputed={state.isDisputed}
					/>
				)}
			</VStack>

			<Card>
				<Card.Body>
					<VStack gap="0" alignItems="stretch">
						<PanelRow label="RESOLVES" value={question.resolutionSource} />
						<PanelRow
							label="LOCKS"
							value={DateTime.fromISO(question.locksAt).toFormat(
								"MMM d, h:mm a",
							)}
						/>
						{question.numericTolerancePct !== null && (
							<PanelRow
								label="TOLERANCE"
								value={`±${Math.round(question.numericTolerancePct * 100)}% of actual`}
							/>
						)}
					</VStack>
				</Card.Body>
			</Card>

			{question.type === "NUMERIC_GUESS" &&
				question.guessDistribution.length > 0 && (
					<Card>
						<Card.Body>
							<GuessDistributionChart
								buckets={question.guessDistribution}
								averageGuess={question.averageGuess}
							/>
						</Card.Body>
					</Card>
				)}

			{!state.isSettled && viewerCall && (
				<Card>
					<Card.Body>
						<VStack gap="2" alignItems="stretch">
							<Tag variant="primary">
								{state.isLocked ? "Awaiting resolution" : "Pending"}
							</Tag>
							<span className={css({ fontSize: "sm" })}>
								You called{" "}
								<span className={css({ fontWeight: "medium" })}>
									{pickSummary(viewerCall)}
								</span>
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.muted",
								})}
							>
								{convictionSummary(viewerCall)} conviction
							</span>
						</VStack>
					</Card.Body>
				</Card>
			)}

			{state.isSettled && viewerCall && result && (
				<Card>
					<Card.Body>
						<VStack gap="1" alignItems="stretch">
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									fontWeight: "bold",
									color:
										result.status === "win"
											? "success.default"
											: result.status === "loss"
												? "danger.default"
												: "fg.muted",
								})}
							>
								{result.status === "pending"
									? "Pending"
									: `${result.status === "win" ? "W" : "L"} ${result.status === "win" ? "+" : ""}${result.points} pts`}
							</span>
							<span className={css({ fontSize: "sm" })}>
								You called{" "}
								<span className={css({ fontWeight: "medium" })}>
									{pickSummary(viewerCall)}
								</span>
							</span>
						</VStack>
					</Card.Body>
				</Card>
			)}

			{state.isLocked && !state.isSettled && !viewerCall && (
				<EmptyState>
					Locked - you didn't call this one. No stake either way.
				</EmptyState>
			)}

			{state.isSettled && !viewerCall && (
				<EmptyState>Resolved - you didn't call this one.</EmptyState>
			)}

			{state.canCall && !viewerCall && <CastCallForm question={question} />}

			{isCreator && state.isLocked && !state.isSettled && (
				<Button
					variant="outline"
					onClick={() =>
						openModal(<ResolveQuestionModal question={question} />)
					}
				>
					Resolve this question
				</Button>
			)}

			{state.isSettled &&
				!state.isDisputed &&
				viewerCall &&
				!question.viewerDispute && (
					<button
						type="button"
						onClick={() => openModal(<DisputeModal questionId={question.id} />)}
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
							cursor: "pointer",
							_hover: { color: "fg.muted" },
						})}
					>
						Dispute this resolution
					</button>
				)}

			<VStack gap="3" alignItems="stretch">
				<h2
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.muted",
						textTransform: "uppercase",
					})}
				>
					Calls
				</h2>
				{viewerCall ? (
					<QuestionCallsList
						questionId={question.id}
						initialItems={calls.items}
						initialPageInfo={calls.pageInfo}
					/>
				) : (
					<EmptyState>
						Make your call to unlock everyone else's picks.
					</EmptyState>
				)}
			</VStack>
		</VStack>
	)
}
