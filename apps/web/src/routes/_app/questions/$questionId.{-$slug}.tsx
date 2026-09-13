import { questionTitleWithGame } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router"
import { DateTime } from "luxon"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiShare } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { FirstCallTour } from "#/components/onboarding/first-call-tour"
import { TourAnchorProvider } from "#/components/onboarding/tour-anchors"
import { BallotStrip } from "#/components/questions/ballot-strip"
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
import { ReportQuestionModal } from "#/components/questions/report-question-modal"
import { ResolveQuestionModal } from "#/components/questions/resolve-question-modal"
import { ShareQuestionModal } from "#/components/questions/share-question-modal"
import { ViewerStatusCard } from "#/components/questions/viewer-status-card"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { NotFound } from "#/components/ui/not-found"
import { Tag } from "#/components/ui/tag"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	questionCallsQuery,
	questionDetailQuery,
} from "#/graphql/queries/question"
import { track } from "#/lib/analytics"
import { safeExternalUrl } from "#/lib/external-url"
import { formatGuess } from "#/lib/field-signal"
import { pageMeta } from "#/lib/meta"
import { questionDetailState } from "#/lib/question-detail-state"
import {
	isNumericQuestionShape,
	questionShapeLabel,
} from "#/lib/question-labels"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { type ToleranceSpec, toleranceSpecFrom } from "#/lib/scoring"
import { buildGameSlug, buildQuestionSlug, questionPath } from "#/lib/slug"
import { disputeAction, viewerStatus } from "#/lib/viewer-status"
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

function toleranceLabel(tolerance: ToleranceSpec): string {
	return match(tolerance)
		.with(
			{ mode: "absolute" },
			({ amount }) => `±${formatGuess(amount, !Number.isInteger(amount))}`,
		)
		.with(
			{ mode: "percentage" },
			({ pct }) => `±${Math.round(pct * 100)}% of actual`,
		)
		.exhaustive()
}

// "How rare was being right" - the correct option's own fieldPct for
// everything option-based, numericHitRatePct (computed across every scored
// guess) for the numeric-guess shapes, which have no options at all.
function fieldAccuracyPctFor(question: {
	shape: QuestionShape
	numericHitRatePct: number | null
	options: { isCorrect: boolean | null; fieldPct: number | null }[]
}): number | null {
	if (isNumericQuestionShape(question.shape)) return question.numericHitRatePct
	return question.options.find((option) => option.isCorrect)?.fieldPct ?? null
}

export const Route = createFileRoute("/_app/questions/$questionId/{-$slug}")({
	component: RouteComponent,
	// The first-call walkthrough is addressed by the URL rather than by a
	// store, so a reload (or a link someone was sent) resumes it instead of
	// dropping the user into a form nobody explained. Anything else in `tour`
	// is discarded rather than trusted.
	// The return type keeps `tour` OPTIONAL rather than "first-call |
	// undefined": a key that is always present, even valued undefined, makes
	// `search` a required prop on every <Link> to this route, and there are a
	// dozen of those that have nothing to do with onboarding.
	validateSearch: (search: Record<string, unknown>): { tour?: "first-call" } =>
		search.tour === "first-call" ? { tour: "first-call" } : {},
	// Without this, navigating between two questions on this same route (e.g.
	// a BallotStrip link) doesn't remount RouteComponent - only the loader data
	// updates. useCastCallForm's internal useForm store (and its own
	// useState calls for conviction/search/step) are all created once via
	// useState(() => ...), so they'd keep the PREVIOUS question's form state
	// - including questionId - alive across the navigation. A call made after
	// switching questions that way would submit against the question you
	// were on when the component first mounted, not the one on screen.
	remountDeps: ({ params }) => params.questionId,
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via useSuspenseQuery.
	loader: async ({ context, params }) => {
		const [detail] = await Promise.all([
			context.queryClient.query(questionDetailQuery(params.questionId)),
			context.queryClient.infiniteQuery(questionCallsQuery(params.questionId)),
		])

		// Same reasoning as the game route's redirect: the slug is decorative
		// and the id identifies the question, so a missing or stale one is
		// corrected rather than 404ing. 302 rather than 301 because the title
		// this is built from is editable - editQuestionTitle exists precisely
		// to revise a bad one - and a cached 301 would outlive the edit.
		const question = detail.question
		if (question) {
			const slug = buildQuestionSlug(question.title)
			if (params.slug !== slug) {
				throw redirect({
					to: "/questions/$questionId/{-$slug}",
					params: { questionId: question.id, slug },
					statusCode: 302,
				})
			}
		}

		return { question: detail.question ?? null }
	},
	head: ({ loaderData }) => {
		const question = loaderData?.question
		if (!question) return {}

		// The question title (matchup first for a game question, since a tab or
		// search result shows nothing else about it), with no "· Called My Shot" suffix unlike
		// every other page here - these titles already run long enough to hit
		// the ~60 characters a search result shows, and the suffix would be the
		// half that gets cut.
		return pageMeta({
			title: questionTitleWithGame(question.title, question.game),
			description: `${question.league.abbreviation} · ${questionShapeLabel[question.shape]}: resolves via ${question.resolutionSource}.`,
			path: questionPath(question),
		})
	},
})

function RouteComponent() {
	const { questionId } = Route.useParams()
	const { tour } = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery(questionDetailQuery(questionId))
	const question = data.question
	const { me } = useRouteContext({ from: "__root__" })
	// Called unconditionally (hooks can't follow the early-return below) -
	// harmless when there's no question yet, since nothing renders CastCallForm
	// or CallSubmitBar in that case either.
	const callForm = useCastCallForm(question)

	if (!question) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Question"
				heading="This question doesn't exist"
				subtitle="It may have been removed, or the link's just wrong. Double check the URL."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const state = questionDetailState(question)
	const status = viewerStatus(state.phase, question.viewerCall)
	// Open and not yet called: the page is the call form (picker, submit bar,
	// first-call tour) rather than the status and field breakdown cards.
	const isCallable = status.kind === "canCall"
	const isCreator = me?.id === question.creator?.id
	const resolutionSourceUrl = safeExternalUrl(question.resolutionSourceUrl)
	const gameLinkParams = question.game
		? {
				gameId: question.game.id,
				slug: buildGameSlug({
					league: question.league,
					homeTeam: question.game.homeTeam,
					awayTeam: question.game.awayTeam,
					startsAt: question.game.startsAt,
				}),
			}
		: null
	const ballot = question.ballotMembership?.ballot ?? null
	const tolerance = toleranceSpecFrom(
		question.numericTolerancePct,
		question.numericToleranceAbsolute,
	)
	const answer = state.isSettled ? resolvedAnswerSummary(question) : null
	const fieldAccuracyPct = state.isSettled
		? fieldAccuracyPctFor(question)
		: null
	// Which option row(s) read as "active" in the breakdown below: your own
	// pick if you called (mirrors numeric's own myGuess highlight - it's your
	// call being pointed at, not necessarily the right one), or the winning
	// option(s) instead once resolved if you never called (nothing else on
	// the row list is meaningful to a spectator on a settled question).
	// Neither once locked-but-not-yet-resolved with no call of your own.
	const breakdownHighlightIds = match(status)
		.returnType<string[]>()
		.with({ kind: P.union("pending", "resolved") }, ({ call }) =>
			call.selections.map((selection) => selection.option.id),
		)
		.with({ kind: "resolvedNoCall" }, () =>
			question.options
				.filter((option) => option.isCorrect)
				.map((option) => option.id),
		)
		.with({ kind: P.union("canCall", "lockedNoCall") }, () => [])
		.with({ kind: "voided" }, ({ call }) =>
			call ? call.selections.map((selection) => selection.option.id) : [],
		)
		.exhaustive()

	return (
		<TourAnchorProvider>
			<VStack
				gap="6"
				alignItems="stretch"
				className={css({ maxWidth: "2xl", minHeight: "100%" })}
			>
				<Breadcrumb>
					<Breadcrumb.Link
						to="/leagues/$leagueSlug"
						params={{ leagueSlug: question.league.slug }}
					>
						{question.league.abbreviation}
					</Breadcrumb.Link>
					{/* A ballot member's trail is the ballot's own (league /
				season / ballot) - ballots are season-award questions, so no
				member has a game crumb to show anyway. */}
					{match({ ballot, game: question.game, gameLinkParams })
						.with({ ballot: P.nonNullable }, ({ ballot }) => (
							<>
								<Breadcrumb.Link
									to="/leagues/$leagueSlug/season"
									params={{ leagueSlug: question.league.slug }}
								>
									Season
								</Breadcrumb.Link>
								<Breadcrumb.Link
									to="/ballots/$ballotSlug"
									params={{ ballotSlug: ballot.slug }}
								>
									{ballot.name}
								</Breadcrumb.Link>
							</>
						))
						.with(
							{ game: P.nonNullable, gameLinkParams: P.nonNullable },
							({ game, gameLinkParams }) => (
								<Breadcrumb.Link
									to="/games/$gameId/{-$slug}"
									params={gameLinkParams}
								>
									{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
								</Breadcrumb.Link>
							),
						)
						.otherwise(() => null)}
					<Breadcrumb.Current>{question.title}</Breadcrumb.Current>
				</Breadcrumb>
				<BallotStrip question={question} />
				<VStack gap="3" alignItems="stretch">
					<HStack gap="2" justify="space-between" alignItems="flex-start">
						<HStack gap="2" flexWrap="wrap">
							{question.isOfficial && <Tag variant="primary">Official</Tag>}
							<Tag>{question.league.abbreviation}</Tag>
							<Tag>{questionShapeLabel[question.shape]}</Tag>
						</HStack>
						{/* Shares the QUESTION - an invitation to call it. Distinct from
					the link on a settled call below, which shares one person's own
					record of it. Available regardless of status or whether you've
					called: an open question is the one most worth sending someone. */}
						<Button
							variant="ghost"
							size="sm"
							aria-label="Share this question"
							onClick={() => {
								track("share_sheet_opened", {
									questionId: question.id,
									surface: "question_detail",
								})
								openModal(
									<ShareQuestionModal
										questionId={question.id}
										questionTitle={question.title}
										questionLeague={question.league}
										sharedGroupIds={question.viewerSharedGroupIds}
										canShareToGroup={me !== null}
									/>,
								)
							}}
							className={css({ flexShrink: 0 })}
						>
							<FiShare size={14} />
							Share
						</Button>
					</HStack>
					<h1 className={css({ fontSize: "2xl", fontFamily: "heading" })}>
						{question.title}
					</h1>
				</VStack>
				{/* Only rendered when this question is actually tied to a single
			game - season-long questions (championship, MVP) have no game and
			this stays hidden for those. */}
				{question.game && gameLinkParams && (
					<GameMatchupHeader
						game={question.game}
						starters={question.game}
						questionsLink={{
							params: gameLinkParams,
							count: question.game.questionCount,
						}}
					/>
				)}
				<Card>
					<Card.Body>
						<VStack gap="0" alignItems="stretch">
							<PanelRow
								label="CREATED BY"
								value={
									question.creator ? (
										<Link
											to="/user/$username"
											params={{ username: question.creator.username }}
											className={css({
												display: "inline-flex",
												minWidth: "0",
												_hover: {
													"& span:first-of-type": {
														textDecoration: "underline",
													},
												},
											})}
										>
											<Identity
												name={question.creator.name}
												username={question.creator.username}
												stackOnMobile
											/>
										</Link>
									) : (
										<span
											className={css({ fontSize: "sm", color: "fg.subtle" })}
										>
											Deleted user
										</span>
									)
								}
							/>
							<PanelRow
								label="RESOLVES"
								value={
									resolutionSourceUrl ? (
										<a
											href={resolutionSourceUrl}
											target="_blank"
											rel="noreferrer"
											className={css({
												textDecoration: "underline",
												textUnderlineOffset: "2px",
												_hover: { color: "primary.default" },
											})}
										>
											{question.resolutionSource} ↗
										</a>
									) : (
										question.resolutionSource
									)
								}
							/>
							<PanelRow
								label="LOCKS"
								value={DateTime.fromISO(question.locksAt).toFormat(
									"MMM d, h:mm a",
								)}
							/>
							{tolerance && (
								<PanelRow label="TOLERANCE" value={toleranceLabel(tolerance)} />
							)}
						</VStack>
					</Card.Body>
					<Card.Footer>
						<HStack justify="center" gap="4" width="full">
							<Link
								to="/how-it-works"
								hash="resolution"
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									color: "fg.subtle",
									_hover: { color: "fg.muted" },
								})}
							>
								how resolution works →
							</Link>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
								})}
							>
								·
							</span>
							{question.viewerReport ? (
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										color: "fg.muted",
									})}
								>
									reported, thanks
								</span>
							) : (
								<button
									type="button"
									onClick={() =>
										me
											? openModal(
													<ReportQuestionModal questionId={question.id} />,
												)
											: openModal(<AuthModal defaultView="signin" />)
									}
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										color: "fg.subtle",
										cursor: "pointer",
										_hover: { color: "primary.default" },
									})}
								>
									report this question
								</button>
							)}
						</HStack>
					</Card.Footer>
				</Card>
				<ViewerStatusCard
					questionId={question.id}
					status={status}
					disputeAction={disputeAction(status, {
						hasSettledDispute: question.hasSettledDispute,
						hasViewerDispute: question.viewerDispute !== null,
					})}
					callCount={question.callCount}
					totalOptions={question.options.length}
					numericTolerancePct={question.numericTolerancePct}
					numericToleranceAbsolute={question.numericToleranceAbsolute}
					isRateStat={callForm.isRateStat}
					answer={answer}
					resolutionNote={question.resolutionNote}
					voidedReason={question.voidedReason}
					fieldAccuracyPct={fieldAccuracyPct}
					questionTitle={question.title}
				/>
				{/* While the call is still open, the picker itself (CastCallForm)
			shows this same live breakdown inline - one card for "make your
			call" and "how the field's calling it", not two on the same page.
			Once there's nothing left to pick (called, locked, resolved), it
			needs a card of its own again - always after the status card above
			(your call/outcome vs. how the whole field called it are two
			different concepts, but the order between them never flips
			regardless of which status - pending, won, either loss - is active). */}
				{isCallable ? (
					<CastCallForm callForm={callForm} />
				) : (
					<FieldBreakdownCard>
						{isNumericQuestionShape(question.shape) ? (
							<GuessDistributionChart
								buckets={question.guessDistribution}
								averageGuess={question.averageGuess}
								myGuess={question.viewerCall?.guessValue ?? null}
								isRateStat={callForm.isRateStat}
							/>
						) : (
							<OptionFieldBreakdown
								options={question.options}
								shape={question.shape}
								ouLine={question.ouLine}
								isRateStat={callForm.isRateStat}
								callCount={question.callCount}
								highlightedOptionIds={breakdownHighlightIds}
							/>
						)}
					</FieldBreakdownCard>
				)}
				{isCreator &&
					state.phase === "locked" &&
					!question.resolvesAutomatically && (
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
					<QuestionCallsList questionId={question.id} />
				</VStack>
				{isCallable && <CallSubmitBar callForm={callForm} />}
				{/* Rendered last so its effects run after the anchors above have
			    mounted and registered themselves. Gated on the same condition
			    as the form itself: there is nothing to walk through on a
			    question that is already called, locked or resolved. */}
				{tour === "first-call" && isCallable && (
					<FirstCallTour
						hasSelection={callForm.selections.length > 0}
						onFinish={() => {
							// Drops the param so a refresh (or a back-navigation
							// later) doesn't replay a tour they already finished.
							void navigate({ search: {}, replace: true })
						}}
					/>
				)}
			</VStack>
		</TourAnchorProvider>
	)
}
