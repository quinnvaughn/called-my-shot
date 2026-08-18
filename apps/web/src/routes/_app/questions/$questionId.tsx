import {
	createFileRoute,
	Link,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CallSubmitBar } from "#/components/questions/call-submit-bar"
import {
	CastCallForm,
	useCastCallForm,
} from "#/components/questions/cast-call-form"
import { FieldBreakdownCard } from "#/components/questions/field-breakdown-card"
import { GuessDistributionChart } from "#/components/questions/guess-distribution-chart"
import { OptionFieldBreakdown } from "#/components/questions/option-field-breakdown"
import { PanelRow } from "#/components/questions/panel-row"
import { QuestionCallsList } from "#/components/questions/question-calls-list"
import { ResolveQuestionModal } from "#/components/questions/resolve-question-modal"
import { ViewerStatusCard } from "#/components/questions/viewer-status-card"
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
import { questionDetailState } from "#/lib/question-detail-state"
import { questionCategoryLabel } from "#/lib/question-labels"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { openModal } from "#/stores/modal-store"

function sectionLabel(text: string) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				color: "fg.muted",
				textTransform: "uppercase",
			})}
		>
			{text}
		</h2>
	)
}

export const Route = createFileRoute("/_app/questions/$questionId")({
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
	const router = useRouter()
	// Called unconditionally (hooks can't follow the early-return below) -
	// harmless when there's no question yet, since nothing renders CastCallForm
	// or CallSubmitBar in that case either.
	const callForm = useCastCallForm(question)

	if (!question) {
		return <EmptyState>This question doesn't exist.</EmptyState>
	}

	const state = questionDetailState(question)
	const isCreator = me?.id === question.creator.id
	const answer = state.isSettled ? resolvedAnswerSummary(question) : null
	// "How rare was being right" - the correct option's own fieldPct for
	// everything option-based, numericHitRatePct (computed across every
	// scored guess) for the one type that isn't a discrete option.
	const fieldAccuracyPct = state.isSettled
		? question.type === "NUMERIC_GUESS"
			? question.numericHitRatePct
			: (question.options.find((option) => option.isCorrect)?.fieldPct ?? null)
		: null
	const viewerCall = question.viewerCall
	// Which option row(s) read as "active" in the breakdown below: your own
	// pick if you called (mirrors numeric's own myGuess highlight - it's your
	// call being pointed at, not necessarily the right one), or the winning
	// option(s) instead once resolved if you never called (nothing else on
	// the row list is meaningful to a spectator on a settled question).
	// Neither once locked-but-not-yet-resolved with no call of your own.
	const breakdownHighlightIds = viewerCall
		? viewerCall.selections.map((selection) => selection.option.id)
		: state.isSettled
			? question.options.filter((option) => option.isCorrect).map((o) => o.id)
			: []

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", minHeight: "100%" })}
		>
			{me && (
				<button
					type="button"
					onClick={() => router.history.back()}
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
						cursor: "pointer",
						textAlign: "left",
						_hover: { color: "fg.muted" },
					})}
				>
					← Back
				</button>
			)}
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
				<h1 className={css({ fontSize: "2xl", fontFamily: "heading" })}>
					{question.title}
				</h1>
			</VStack>
			{/* Only rendered when this question is actually tied to a single
			game - season-long questions (championship, MVP) have no game and
			this stays hidden for those. */}
			{question.game && (
				<HStack
					justify="space-between"
					alignItems="center"
					flexWrap="wrap"
					gap="2"
					className={css({
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						bg: "bg.subtle",
						paddingInline: "3",
						paddingBlock: "2.5",
					})}
				>
					<HStack gap="2" alignItems="center">
						<TeamBadge
							abbreviation={question.game.awayTeam.abbreviation}
							color={question.game.awayTeam.color}
						/>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							@
						</span>
						<TeamBadge
							abbreviation={question.game.homeTeam.abbreviation}
							color={question.game.homeTeam.color}
						/>
					</HStack>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.muted",
							whiteSpace: "nowrap",
						})}
					>
						{DateTime.fromISO(question.game.startsAt).toFormat("MMM d, h:mm a")}
					</span>
				</HStack>
			)}
			<Card>
				<Card.Body>
					<VStack gap="0" alignItems="stretch">
						<PanelRow
							label="CREATED BY"
							value={
								<Link
									to="/user/$username"
									params={{ username: question.creator.username }}
									className={css({
										display: "inline-flex",
										_hover: {
											"& span:first-of-type": { textDecoration: "underline" },
										},
									})}
								>
									<Identity
										name={question.creator.name}
										username={question.creator.username}
									/>
								</Link>
							}
						/>
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
			<ViewerStatusCard
				questionId={question.id}
				state={state}
				callCount={question.callCount}
				numericTolerancePct={question.numericTolerancePct}
				viewerCall={viewerCall}
				hasViewerDispute={question.viewerDispute !== null}
				answer={answer}
				resolutionNote={question.resolutionNote}
				fieldAccuracyPct={fieldAccuracyPct}
			/>
			{/* While the call is still open, the picker itself (CastCallForm)
			shows this same live breakdown inline - one card for "make your
			call" and "how the field's calling it", not two on the same page.
			Once there's nothing left to pick (called, locked, resolved), it
			needs a card of its own again - always after the status card above
			(your call/outcome vs. how the whole field called it are two
			different concepts, but the order between them never flips
			regardless of which status - pending, won, either loss - is active). */}
			{!(state.canCall && !viewerCall) && (
				<FieldBreakdownCard>
					{question.type === "NUMERIC_GUESS" ? (
						<GuessDistributionChart
							buckets={question.guessDistribution}
							averageGuess={question.averageGuess}
							myGuess={viewerCall?.guessValue ?? null}
						/>
					) : (
						<OptionFieldBreakdown
							options={question.options}
							type={question.type}
							ouLine={question.ouLine}
							callCount={question.callCount}
							highlightedOptionIds={breakdownHighlightIds}
						/>
					)}
				</FieldBreakdownCard>
			)}
			{state.canCall && !viewerCall && <CastCallForm callForm={callForm} />}
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
			<VStack gap="3" alignItems="stretch">
				{sectionLabel("Calls")}
				<QuestionCallsList
					questionId={question.id}
					initialItems={calls.items}
					initialPageInfo={calls.pageInfo}
				/>
			</VStack>
			{state.canCall && !viewerCall && <CallSubmitBar callForm={callForm} />}
		</VStack>
	)
}
