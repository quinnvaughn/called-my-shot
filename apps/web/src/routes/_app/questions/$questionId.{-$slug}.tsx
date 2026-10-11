import { questionTitleWithGame } from "@called-my-shot/schemas"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router"
import { DateTime } from "luxon"
import { useEffect, useRef, useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiShare } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameSetRail } from "#/components/games/game-set-rail"
import { FirstCallTour } from "#/components/onboarding/first-call-tour"
import { TourAnchorProvider } from "#/components/onboarding/tour-anchors"
import { BallotSetRail } from "#/components/ballots/ballot-set-rail"
import { BallotStrip } from "#/components/questions/ballot-strip"
import { CallSubmitBar } from "#/components/questions/call-submit-bar"
import {
	CastCallForm,
	useCastCallForm,
} from "#/components/questions/cast-call-form"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { FieldBreakdownCard } from "#/components/questions/field-breakdown-card"
import { GameStrip, useGameNextUp } from "#/components/questions/game-strip"
import { GuessDistributionChart } from "#/components/questions/guess-distribution-chart"
import { OptionFieldBreakdown } from "#/components/questions/option-field-breakdown"
import { PanelRow } from "#/components/questions/panel-row"
import { QuestionCallsList } from "#/components/questions/question-calls-list"
import { ReportQuestionModal } from "#/components/questions/report-question-modal"
import { ResolveQuestionModal } from "#/components/questions/resolve-question-modal"
import { SeriesBlock } from "#/components/questions/series-block"
import { ShareQuestionModal } from "#/components/questions/share-question-modal"
import { StatContextCard } from "#/components/questions/stat-context-card"
import { StreakStakeLine } from "#/components/questions/streak-stake-line"
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
	questionStatContextQuery,
} from "#/graphql/queries/question"
import { questionHorizon, track } from "#/lib/analytics"
import { callMarginFor, marginLabel } from "#/lib/call-summary"
import { safeExternalUrl } from "#/lib/external-url"
import { formatGuess } from "#/lib/field-signal"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"
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

const STATUS_CARD_SCROLL_DELAY_MS = 150

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
	// The set this question belongs to beside it, in place of its strip from
	// xl up. Renders nothing for a question on neither a ballot nor a game.
	staticData: { rightRail: <QuestionSetRailFor /> },
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via useSuspenseQuery.
	loader: async ({ context, params }) => {
		// Warmed but deliberately not awaited: the cards are color on a page
		// whose job is taking a call, so a slow card set must never hold up the
		// pick form. The section renders nothing until this lands.
		void context.queryClient
			.query(questionStatContextQuery(params.questionId))
			.catch(() => {})

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
			title: question.series?.gameOne
				? `${question.series.gameOne.awayTeam.abbreviation} vs ${question.series.gameOne.homeTeam.abbreviation} ${question.series.roundLabel} · ${question.title}`
				: questionTitleWithGame(question.title, question.game),
			description: `${question.league.abbreviation} · ${questionShapeLabel[question.shape]}: resolves via ${question.resolutionSource}.`,
			path: questionPath(question),
		})
	},
})

// Reads the cache entry RouteComponent loads and polls, so the rail moves
// with the page rather than fetching on its own.
function QuestionSetRailFor() {
	const { questionId } = Route.useParams()
	const { data } = useSuspenseQuery(questionDetailQuery(questionId))
	const { me } = useRouteContext({ from: "__root__" })
	const question = data.question
	if (!question) return null
	// Ballot members are season-long questions, so a question is on one set
	// or the other, never both.
	if (question.ballotMembership) {
		return (
			<BallotSetRail question={question} username={me?.username ?? null} />
		)
	}
	const game = question.game
	if (!game) return null
	return (
		<GameSetRail
			game={game}
			questions={game.officialQuestions}
			communityQuestions={game.viewerCommunityQuestions}
			username={me?.username ?? null}
			currentQuestionId={question.id}
			gameLinkParams={{
				gameId: game.id,
				slug: buildGameSlug({
					league: question.league,
					homeTeam: game.homeTeam,
					awayTeam: game.awayTeam,
					startsAt: game.startsAt,
				}),
			}}
		/>
	)
}

function RouteComponent() {
	const { questionId } = Route.useParams()
	const { tour } = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery({
		...questionDetailQuery(questionId),
		refetchInterval: (query) => {
			const game = query.state.data?.question?.game
			return game && isGameInPlay(game) ? IN_PLAY_REFETCH_MS : false
		},
	})
	// Not suspense: the loader fires this without awaiting, so the page has
	// to render before it lands.
	const statContext = useQuery(questionStatContextQuery(questionId))

	const question = data.question
	// Both competitors, so a game log can name the opponent. An opponent from
	// an earlier matchup isn't in here and simply shows no abbreviation, which
	// beats another request for a line of mono text.
	const teamLabels = question?.game
		? {
				[question.game.homeTeam.id]: question.game.homeTeam.abbreviation,
				[question.game.awayTeam.id]: question.game.awayTeam.abbreviation,
			}
		: {}
	const { me } = useRouteContext({ from: "__root__" })
	// Called unconditionally (hooks can't follow the early-return below) -
	// harmless when there's no question yet, since nothing renders CastCallForm
	// or CallSubmitBar in that case either.
	// Redo mode whenever the viewer has a call that could still be taken back.
	// Safe to pass unconditionally: a viewer with a call is never offered the
	// first-call form (isCallable is false), so this only ever seeds the form
	// that the redo CTA opens.
	const redoMode = question?.viewerCall?.viewerCanRedo
		? {
				callId: question.viewerCall.id,
				current: {
					caseText: question.viewerCall.caseText,
					guessValue: question.viewerCall.guessValue,
					conviction: question.viewerCall.conviction,
					selections: question.viewerCall.selections.map((s) => ({
						optionId: s.option.id,
						conviction: s.conviction,
					})),
				},
			}
		: undefined
	// A new call swaps the form for the pending card, which can land anywhere
	// relative to where the viewer was scrolled. Flagged once the submit has
	// finished and the confirm modal is gone, then scrolled to after a short
	// delay so the card has rendered and the router's refresh has settled -
	// not on a redo or a plain page load.
	const statusCardRef = useRef<HTMLDivElement>(null)
	const [scrollToStatusCard, setScrollToStatusCard] = useState(false)
	useEffect(() => {
		if (!scrollToStatusCard) return
		const timeout = setTimeout(() => {
			statusCardRef.current?.scrollIntoView({
				block: "start",
				behavior: "smooth",
			})
			setScrollToStatusCard(false)
		}, STATUS_CARD_SCROLL_DELAY_MS)
		return () => clearTimeout(timeout)
	}, [scrollToStatusCard])
	const callForm = useCastCallForm(question, {
		surface: "question_page",
		redo: redoMode,
		onCalled: () => setScrollToStatusCard(true),
	})
	const [redoRequested, setRedoRequested] = useState(false)
	// Gated on redoMode as well as the click, so the form closes itself once
	// the redo lands: viewerCanRedo goes false the moment a call has been
	// redone, which clears redoMode. Without that pairing the picker would
	// stay open and re-submit as a first call on a question already called.
	const isRedoing = redoRequested && redoMode !== undefined

	// Captured once per mount, which remountDeps makes once per question. The
	// state is what the page first offered, not what it becomes after a call.
	const trackedView = useRef(false)
	const viewedQuestion = question
		? {
				questionId: question.id,
				questionShape: question.shape.toLowerCase() as QuestionCallShape,
				leagueId: question.league.id,
				sportId: question.sport.id,
				viewerState: viewerStatus(
					questionDetailState(question).phase,
					question.viewerCall,
				).kind,
			}
		: null
	useEffect(() => {
		if (!viewedQuestion || trackedView.current) return
		trackedView.current = true
		track("question_viewed", {
			...viewedQuestion,
			horizon: questionHorizon(viewedQuestion.questionShape),
		})
	})
	const nextUp = useGameNextUp(question)

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
	// The player or team the answer is, when exactly one option won.
	const correctOptions = question.options.filter((o) => o.isCorrect)
	const answerSubject =
		answer && correctOptions.length === 1 ? (correctOptions[0] ?? null) : null
	const fieldAccuracyPct = state.isSettled
		? fieldAccuracyPctFor(question)
		: null
	// The viewer's own call's margin, as the word the status badge leads with.
	// Derived here rather than inside ViewerStatusCard because that card
	// carries a deliberately trimmed ViewerCall, while this scope already has
	// the whole resolved question. Same label the eyebrow on /calls/:id shows,
	// so the two can't contradict each other about the same call.
	const viewerMarginLabel = (() => {
		const call = question.viewerCall
		if (!call) return null
		const margin = callMarginFor({
			guessValue: call.guessValue,
			conviction: call.conviction,
			totalPoints: call.totalPoints,
			question: {
				shape: question.shape,
				ouLine: question.ouLine,
				numericActualValue: question.numericActualValue,
				numericToleranceAbsolute: question.numericToleranceAbsolute,
				numericTolerancePct: question.numericTolerancePct,
				stat: question.stat,
				scoredOptions: question.scoredOptions,
			},
			selections: call.selections.map((s) => ({
				id: s.id,
				conviction: s.conviction,
				option: {
					label: s.option.label,
					isCorrect: s.option.isCorrect,
					actualValue: s.option.actualValue,
				},
			})),
		})
		return margin?.verdict
			? marginLabel(margin.verdict, (call.totalPoints ?? 0) >= 0)
			: null
	})()
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
				ballots / ballot) - ballots are season-award questions, so no
				member has a game crumb to show anyway. */}
					{match({ ballot, game: question.game, gameLinkParams })
						.with({ ballot: P.nonNullable }, ({ ballot }) => (
							<>
								<Breadcrumb.Link
									to="/leagues/$leagueSlug/ballots"
									params={{ leagueSlug: question.league.slug }}
								>
									Ballots
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
				<BallotStrip
					question={question}
					className={css({ display: { base: "flex", xl: "none" } })}
				/>
				<GameStrip
					question={question}
					className={css({ display: { base: "flex", xl: "none" } })}
				/>
				<VStack gap="3" alignItems="stretch">
					<HStack gap="2" justify="space-between" alignItems="flex-start">
						<HStack gap="2" flexWrap="wrap">
							{/* Stated either way: this row is the only thing on the page
						that says what kind of question you're reading, and an absent
						badge isn't a signal anyone reads. Feed cards keep tagging
						Official alone, where a Community tag would sit on nearly every
						card and carry nothing. */}
							{question.isOfficial ? (
								<Tag variant="primary">Official</Tag>
							) : (
								<Tag>Community</Tag>
							)}
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
										pinnedGroupIds={question.viewerPinnedGroupIds}
										canShareToGroup={me !== null}
										canPin={
											question.status === "OPEN" &&
											new Date(question.locksAt) > new Date()
										}
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
				{question.game && (
					<GameMatchupHeader game={question.game} starters={question.game} />
				)}
				{/* A series question's counterpart: the round, the two teams and
			where the series stands, which its short title leaves out. */}
				{question.series && <SeriesBlock series={question.series} />}
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
												avatarUrl={question.creator.avatarUrl}
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
				{/* Hidden while re-picking. This card states the call as it
			    stands, and leaving a "pending: your call is locked" face above
			    a form that is changing that very call says two contradictory
			    things at once. The picker already opens seeded with the
			    existing pick, so nothing is lost by standing it down. */}
				{!isRedoing && (
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
						answerSubject={answerSubject}
						resolutionNote={question.resolutionNote}
						voidedReason={question.voidedReason}
						fieldAccuracyPct={fieldAccuracyPct}
						marginLabel={viewerMarginLabel}
						questionTitle={question.title}
						nextUp={nextUp}
						ref={statusCardRef}
						// Null unless this call could still be taken back, and once
						// the picker is open the offer has been taken.
						redo={
							question.viewerCall?.viewerCanRedo && !isRedoing
								? {
										questionShape:
											question.shape.toLowerCase() as QuestionCallShape,
										balance: me?.redoBalance ?? 0,
										action: {
											// No confirmation step: opening the picker
											// spends nothing. The redo is only charged
											// on submit, which already goes through
											// ConfirmCallModal like any other call.
											kind: "open",
											onStart: () => setRedoRequested(true),
										},
									}
								: null
						}
					/>
				)}
				{/* Directly above the pick form, so it reads as input to the call
			    rather than trivia below it. Renders nothing until the loader's
			    unawaited prefetch lands, and nothing at all when there's no
			    history to show. */}
				<StatContextCard
					statContext={statContext.data?.question?.statContext}
					trackRecord={statContext.data?.question?.viewerTrackRecord}
					teams={teamLabels}
					isCallable={isCallable}
				/>
				{/* While the call is still open, the picker itself (CastCallForm)
			shows this same live breakdown inline - one card for "make your
			call" and "how the field's calling it", not two on the same page.
			Once there's nothing left to pick (called, locked, resolved), it
			needs a card of its own again - always after the status card above
			(your call/outcome vs. how the whole field called it are two
			different concepts, but the order between them never flips
			regardless of which status - pending, won, either loss - is active). */}
				{isCallable || isRedoing ? (
					<VStack gap="3" alignItems="stretch">
						{question.viewerStreak && (
							<StreakStakeLine
								leagueAbbr={question.league.abbreviation}
								stake={question.viewerStreak}
							/>
						)}
						<CastCallForm callForm={callForm} />
					</VStack>
				) : (
					<FieldBreakdownCard>
						{isNumericQuestionShape(question.shape) ? (
							<GuessDistributionChart
								buckets={question.guessDistribution}
								averageGuess={question.averageGuess}
								myGuess={question.viewerCall?.guessValue ?? null}
								tone="record"
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
				{(isCallable || isRedoing) && <CallSubmitBar callForm={callForm} />}
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
