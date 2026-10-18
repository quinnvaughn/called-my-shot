import { questionTitleWithGame } from "@called-my-shot/schemas"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { RailTab } from "#/components/app-shell/rail-tab"
import { BallotSetRail } from "#/components/ballots/ballot-set-rail"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameSetRail } from "#/components/games/game-set-rail"
import { FirstCallTour } from "#/components/onboarding/first-call-tour"
import { TourAnchorProvider } from "#/components/onboarding/tour-anchors"
import { CallSubmitBar } from "#/components/questions/call-submit-bar"
import { useCastCallForm } from "#/components/questions/cast-call-form"
import { QuestionCallsList } from "#/components/questions/question-calls-list"
import { QuestionBreadcrumb } from "#/components/questions/question-detail/question-breadcrumb"
import { QuestionDetailHeader } from "#/components/questions/question-detail/question-detail-header"
import { QuestionDetailsCard } from "#/components/questions/question-detail/question-details-card"
import { QuestionPickSection } from "#/components/questions/question-detail/question-pick-section"
import { ResolveQuestionModal } from "#/components/questions/resolve-question-modal"
import { SeriesBlock } from "#/components/questions/series-block"
import { StatContextCard } from "#/components/questions/stat-context-card/stat-context-card"
import { useGameNextUp } from "#/components/questions/use-game-next-up"
import { ViewerStatusCard } from "#/components/questions/viewer-status-card/viewer-status-card"
import { Button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { SectionLabel } from "#/components/ui/section-label"
import {
	questionCallsQuery,
	questionDetailQuery,
	questionStatContextQuery,
} from "#/graphql/questions/queries"
import { useMe } from "#/hooks/use-me"
import { questionHorizon, track } from "#/lib/analytics"
import { viewerMarginLabel } from "#/lib/call-summary"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import { questionDetailState } from "#/lib/question-detail-state"
import {
	fieldAccuracyPctFor,
	questionShapeLabel,
	toCallShape,
} from "#/lib/question-labels"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { searchFlag } from "#/lib/search-params"
import { buildGameSlug, buildQuestionSlug, questionPath } from "#/lib/slug"
import { viewerStatus } from "#/lib/viewer-status"
import { openModal } from "#/stores/modal-store"

const STATUS_CARD_SCROLL_DELAY_MS = 150

export const Route = createFileRoute("/_app/questions/$questionId/{-$slug}")({
	component: RouteComponent,
	// The first-call walkthrough is addressed by the URL rather than by a
	// store, so a reload (or a link someone was sent) resumes it instead of
	// dropping the user into a form nobody explained. Anything else in `tour`
	// is discarded rather than trusted.
	// Both keys are optional, so the dozen <Link>s to this route that have
	// nothing to do with onboarding needn't pass `search`.
	// `created` is set once, right after the viewer writes the question, to
	// offer a challenge on it while it's fresh.
	validateSearch: z.object({
		tour: z.literal("first-call").optional().catch(undefined),
		created: searchFlag,
	}),
	// Without this, navigating between two questions on this same route (e.g.
	// a rail link) doesn't remount RouteComponent - only the loader data
	// updates. useCastCallForm's internal useForm store (and its own
	// useState calls for conviction/search/step) are all created once via
	// useState(() => ...), so they'd keep the PREVIOUS question's form state
	// - including questionId - alive across the navigation. A call made after
	// switching questions that way would submit against the question you
	// were on when the component first mounted, not the one on screen.
	remountDeps: ({ params }) => params.questionId,
	// The set this question belongs to beside it, from xl up, and a sheet from
	// RailTab below that. Renders nothing for a question on neither a ballot
	// nor a game.
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
	const me = useMe()
	const question = data.question
	if (!question) return null
	// Ballot members are season-long questions, so a question is on one set
	// or the other, never both.
	if (question.ballotMembership) {
		return <BallotSetRail question={question} username={me?.username ?? null} />
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
	const { tour, created } = Route.useSearch()
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
	const me = useMe()
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
	useEffect(() => {
		if (!question || trackedView.current) return
		trackedView.current = true
		const questionShape = toCallShape(question.shape)
		track("question_viewed", {
			questionId: question.id,
			questionShape,
			leagueId: question.league.id,
			sportId: question.sport.id,
			viewerState: viewerStatus(
				questionDetailState(question).phase,
				question.viewerCall,
			).kind,
			horizon: questionHorizon(questionShape),
		})
	}, [question])
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
	const viewerMargin = viewerMarginLabel(question)

	return (
		<TourAnchorProvider>
			<VStack
				gap="6"
				alignItems="stretch"
				className={css({ minHeight: "100%" })}
			>
				<QuestionBreadcrumb question={question} />
				{(question.game || question.ballotMembership) && (
					<RailTab title="Your calls">
						<QuestionSetRailFor />
					</RailTab>
				)}
				<QuestionDetailHeader question={question} created={created} />
				{/* Only rendered when this question is actually tied to a single
			game - season-long questions (championship, MVP) have no game and
			this stays hidden for those. */}
				{question.game && (
					<GameMatchupHeader game={question.game} starters={question.game} />
				)}
				{/* A series question's counterpart: the round, the two teams and
			where the series stands, which its short title leaves out. */}
				{question.series && <SeriesBlock series={question.series} />}
				<QuestionDetailsCard question={question} />
				{/* Hidden while re-picking. This card states the call as it
			    stands, and leaving a "pending: your call is locked" face above
			    a form that is changing that very call says two contradictory
			    things at once. The picker already opens seeded with the
			    existing pick, so nothing is lost by standing it down. */}
				{!isRedoing && (
					<ViewerStatusCard
						question={question}
						phase={state.phase}
						isRateStat={callForm.isRateStat}
						answer={answer}
						answerSubject={answerSubject}
						fieldAccuracyPct={fieldAccuracyPct}
						marginLabel={viewerMargin}
						nextUp={nextUp}
						ref={statusCardRef}
						// Null unless this call could still be taken back, and once
						// the picker is open the offer has been taken.
						redo={
							question.viewerCall?.viewerCanRedo && !isRedoing
								? {
										questionShape: toCallShape(question.shape),
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
				<QuestionPickSection
					question={question}
					status={status}
					callForm={callForm}
					showForm={isCallable || isRedoing}
				/>
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
					<SectionLabel>Calls</SectionLabel>
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
