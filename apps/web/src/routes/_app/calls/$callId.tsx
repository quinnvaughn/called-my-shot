import { effectiveLossRate } from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	CallRecordCard,
	type CallRecordCardData,
} from "#/components/questions/call-record-card"
import {
	buildCallTweet,
	CallShareRow,
} from "#/components/questions/call-share-row"
import { CallSignupCta } from "#/components/questions/call-signup-cta"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { DoubtersPanel } from "#/components/questions/doubters-panel"
import { FadeCta } from "#/components/questions/fade-cta"
import { GloatCta } from "#/components/questions/gloat-cta"
import { RedoCta } from "#/components/questions/redo-cta"
import { RedoPanel } from "#/components/questions/redo-panel"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import type { CallRecordQuery } from "#/graphql/generated/graphql"
import { callRecordQuery } from "#/graphql/queries/call"
import { callGifState } from "#/lib/call-gif"
import { callCardVersion, callPageMeta } from "#/lib/call-meta"
import {
	actualSummary,
	callMarginFor,
	marginLabel,
	pickSummary,
} from "#/lib/call-summary"
import { gloatText } from "#/lib/fade-copy"
import { formatGuess, isRateStat } from "#/lib/field-signal"
import { formatCallDate, formatCallLead } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"
import {
	isNumericQuestionShape,
	isOverUnderQuestionShape,
	optionDisplayLabel,
	shareCardShapeLabel,
} from "#/lib/question-labels"
import {
	BASE_POINTS_BY_GQL_SHAPE,
	previewNumericPoints,
	previewSelectionPoints,
	selectionEarlyTier,
} from "#/lib/scoring"
import { buildQuestionSlug } from "#/lib/slug"
import { streakFamilyParam } from "#/lib/streak-meta"

// No slug segment, unlike /questions/:id/:slug and /games/:id/:slug. A slug
// there earns its keep with crawlers; nothing about a single person's call
// wants indexing, and calls are deliberately left out of the sitemap for the
// same reason. This url exists to be pasted, so its title and og:image each
// state the whole call on their own (see lib/call-meta.ts).
export const Route = createFileRoute("/_app/calls/$callId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(callRecordQuery(params.callId))
		return { call: data.call ?? null }
	},
	head: ({ loaderData }) => {
		const call = loaderData?.call
		if (!call) return {}

		const view = describeCall(call)
		const { title, description } = callPageMeta({
			username: view.username,
			pickLabel: view.pickLabel,
			questionTitle: call.question.title,
			game: call.question.game,
			leagueAbbr: view.leagueAbbr,
			shapeLabel: shareCardShapeLabel[call.question.shape],
			conviction: view.conviction,
			points: view.points,
			isWin: view.isWin,
			exact: view.closeness?.kind === "exact",
			marginLabel: view.margin?.verdict
				? marginLabel(view.margin.verdict, view.isWin === true)
				: null,
			questionStatus: view.questionStatus,
			calledAt: view.calledAt,
			locksAt: formatCallDate(view.locksAt),
			resolvedAt: view.resolvedAt ? formatCallDate(view.resolvedAt) : null,
			caseText: call.caseText,
		})

		return pageMeta({
			title,
			description,
			path: `/calls/${call.id}`,
			image: {
				// Third-party unfurl caches hold a scraped card for days, so a
				// link shared while the call was pending would keep previewing
				// "awaiting result" long after it settled. Resolution changes this
				// url, which is a url they have never scraped. It can't fix links
				// already posted; it does fix every share after. The proxy route
				// ignores the param.
				path: `/share/calls/${call.id}/card.png?v=${callCardVersion(
					view.resolvedAt,
					call.streak?.length ?? null,
					call.redo?.redoneAt ?? null,
				)}`,
				alt: title,
			},
		})
	},
})

// Everything the page and its meta tags both need, derived once. Mirrors what
// apps/api's share-cards/call-summary.ts derives for the og:image off the
// same call, so the page and the picture of it state the same facts.
function describeCall(call: NonNullable<CallRecordQuery["call"]>) {
	const isNumeric = isNumericQuestionShape(call.question.shape)
	const points = call.totalPoints
	const isWin = points === null ? null : points >= 0

	const summaryData = {
		guessValue: call.guessValue,
		conviction: call.conviction,
		totalPoints: call.totalPoints,
		question: {
			shape: call.question.shape,
			ouLine: call.question.ouLine,
			numericActualValue: call.question.numericActualValue,
			numericToleranceAbsolute: call.question.numericToleranceAbsolute,
			numericTolerancePct: call.question.numericTolerancePct,
			stat: call.question.stat,
			scoredOptions: call.question.scoredOptions,
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
	}
	const pickLabel = pickSummary(summaryData)

	// "Field agreed" only means something for a lone selection. A numeric guess
	// is too specific for anyone to share it, and
	// player_season_award/team_season_award's several independent picks have
	// no single number, so both stay null rather than stating a share nobody
	// actually picked.
	const fieldPct =
		!isNumeric && call.selections.length === 1
			? (call.selections[0]?.option.fieldPct ?? null)
			: null

	// A numeric guess's closeness to the real number is its own stat: without
	// it the card states the guess and the points but never how near it landed.
	const distance =
		isNumeric &&
		call.guessValue !== null &&
		call.question.numericActualValue !== null
			? Math.abs(call.guessValue - call.question.numericActualValue)
			: null
	const closeness: CallRecordCardData["closeness"] =
		distance === null
			? null
			: distance === 0
				? { kind: "exact" }
				: {
						kind: "off",
						by: formatGuess(distance, isRateStat(call.question)),
					}

	const conviction = isNumeric
		? (call.conviction ?? 0)
		: call.selections.length > 0
			? Math.round(
					call.selections.reduce((sum, s) => sum + s.conviction, 0) /
						call.selections.length,
				)
			: 0

	// How far the call landed from its line, on every shape with two numbers
	// to subtract rather than just the numeric guesses `closeness` covers.
	// Null verdict is the ordinary case: the distance is worth stating, the
	// size of it isn't worth a word.
	const margin = callMarginFor(summaryData)

	// The abandoned pick, run through the same summariser as the live one so
	// the two read as the same kind of claim rather than one being a raw
	// label. Uses the question as it stands, which is right: the whole point
	// is to compare the two picks against the same outcome.
	const redo = call.redo
		? {
				originalCalledAt: formatCallDate(call.redo.originalCreatedAt),
				redoneAt: formatCallDate(call.redo.redoneAt),
				originalPickLabel: pickSummary({
					...summaryData,
					guessValue: call.redo.originalGuessValue,
					conviction: call.redo.originalConviction,
					selections: call.redo.originalSelections.map((s) => ({
						id: s.id,
						conviction: s.conviction,
						option: {
							label: s.option.label,
							isCorrect: s.option.isCorrect,
							actualValue: s.option.actualValue,
						},
					})),
				}),
				currentPickLabel: pickLabel,
				originalCaseText: call.redo.originalCaseText,
				// Null until the question resolves, which is when isCorrect
				// stops being null. A numeric guess has no "would the old
				// number have hit" without re-running the tolerance band, so
				// it stays null and the panel simply shows both guesses.
				originalWasCorrect: isNumeric
					? null
					: firstDefined(
							call.redo.originalSelections.map((s) => s.option.isCorrect),
						),
				currentIsWin: isWin,
			}
		: null

	return {
		pickLabel,
		points,
		isWin,
		fieldPct,
		closeness,
		margin,
		redo,
		actual: actualSummary({ question: summaryData.question }),
		conviction,
		username: call.user.username,
		name: call.user.name,
		avatarUrl: call.user.avatarUrl,
		leagueAbbr: call.question.league.abbreviation.toUpperCase(),
		calledAt: formatCallDate(call.createdAt),
		questionStatus: call.question.status,
		locksAt: call.question.locksAt,
		resolvedAt: call.question.resolvedAt,
	}
}

// What an unsettled call pays if right and costs if wrong, from the same
// scoring helpers the question page's status card previews with, so the two
// pages can't disagree. Null once the question settles, and for an award
// call with several picks, which has no single pair of numbers.
function pendingPayout(
	call: NonNullable<CallRecordQuery["call"]>,
): { win: string; lose: string } | null {
	const question = call.question
	if (question.status !== "OPEN" && question.status !== "LOCKED") return null
	const basePoints = BASE_POINTS_BY_GQL_SHAPE[question.shape]

	if (isNumericQuestionShape(question.shape)) {
		if (call.conviction === null) return null
		const preview = previewNumericPoints(
			basePoints,
			question.lossRate,
			call.conviction,
			call.currentRank,
			question.callCount,
		)
		return {
			win: `+${preview.winLow}–${preview.winHigh}`,
			lose: `−${preview.lose}`,
		}
	}

	const [selection, ...rest] = call.selections
	if (!selection || rest.length > 0 || selection.option.fieldPct === null) {
		return null
	}
	const preview = previewSelectionPoints(
		basePoints,
		effectiveLossRate(question.lossRate, selection.option.lossRate),
		selection.option.fieldPct,
		question.options.length,
		selection.conviction,
		selectionEarlyTier(
			question.shape,
			call.currentRank,
			question.callCount,
			call.seasonGamesPlayed,
			call.seasonTotalGames,
		),
	)
	return { win: `+${preview.win}`, lose: `−${preview.lose}` }
}

// An award call has several picks; it counts as having been right if any of
// them was. Null while the question is unresolved, where every isCorrect is
// still null.
function firstDefined(flags: (boolean | null | undefined)[]): boolean | null {
	if (flags.length === 0 || flags.every((f) => f === null || f === undefined)) {
		return null
	}
	return flags.some((f) => f === true)
}

function RouteComponent() {
	const { callId } = Route.useParams()
	const { data } = useSuspenseQuery(callRecordQuery(callId))
	const call = data.call
	const { me } = useRouteContext({ from: "__root__" })

	if (!call) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Call"
				heading="This call doesn't exist"
				subtitle="It may have been removed, or the link's just wrong. Double check the URL."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const view = describeCall(call)
	const resolved = view.points !== null && view.isWin !== null

	const cardData: CallRecordCardData = {
		name: view.name,
		username: view.username,
		avatarUrl: view.avatarUrl,
		pickLabel: view.pickLabel,
		picks:
			(call.question.shape === "PLAYER_SEASON_AWARD" ||
				call.question.shape === "TEAM_SEASON_AWARD") &&
			call.selections.length > 1
				? call.selections.map((s) => ({
						label: s.option.label,
						hit: s.option.isCorrect ?? null,
					}))
				: null,
		calledAt: view.calledAt,
		isWin: view.isWin,
		points: view.points,
		inTheAir: pendingPayout(call),
		fieldPct: view.fieldPct,
		closeness: view.closeness,
		// The label replaces the verdict word in the card's eyebrow; the
		// distance fills the Off by row underneath it. Only a resolved call
		// with a real gap has either.
		marginLabel:
			resolved && view.margin?.verdict
				? marginLabel(view.margin.verdict, view.isWin === true)
				: null,
		offBy:
			resolved && view.margin
				? formatGuess(view.margin.displayDistance, isRateStat(call.question))
				: null,
		actual: view.actual,
		conviction: view.conviction,
		caseText: call.caseText,
		streakLength: call.streak?.length ?? null,
		fading: call.fading
			? {
					username: call.fading.target.user.username,
					callId: call.fading.target.id,
					settled:
						view.questionStatus !== "OPEN" && view.questionStatus !== "LOCKED",
					outcome: call.fading.targetFlippedAt
						? "flipped"
						: call.fading.winner === "FADER"
							? "won"
							: call.fading.winner === "TARGET"
								? "lost"
								: null,
					gloat: call.fading.gloat
						? {
								username:
									call.fading.winner === "FADER"
										? view.username
										: call.fading.target.user.username,
								text: gloatText(call.fading.gloat),
							}
						: null,
				}
			: null,
		// Which reaction pool the card draws from. Derived from the same facts
		// the eyebrow above it is, so the gif and the words agree about what
		// happened - see callGifState for the two precedence rules that aren't
		// obvious.
		gifState: callGifState(view),
		pendingLabel: match(view.questionStatus)
			.with("OPEN", () => `Locks ${formatCallDate(view.locksAt)}`)
			.with("VOIDED", () => "Voided, no result")
			.with("LOCKED", "RESOLVED", "DISPUTED", () => "Awaiting result")
			.exhaustive(),
	}

	const lead = view.resolvedAt
		? formatCallLead(call.createdAt, view.resolvedAt)
		: null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug"
					params={{ leagueSlug: call.question.league.slug }}
				>
					{call.question.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Link
					to="/questions/$questionId/{-$slug}"
					params={{
						questionId: call.question.id,
						slug: buildQuestionSlug(call.question.title),
					}}
				>
					{call.question.title}
				</Breadcrumb.Link>
				<Breadcrumb.Current>@{call.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			{/* The question is the page's title, as it is on the question page,
			and the card below is one person's answer to it - whose is on the
			card's own header. */}
			<h1 className={css({ fontSize: "2xl", fontFamily: "heading" })}>
				{call.question.title}
			</h1>

			<CallRecordCard
				data={cardData}
				// The page about one call is where someone goes when they want
				// to change that call, so the offer belongs here as much as on
				// the question. The form itself lives on the question page
				// rather than being duplicated onto a page whose job is stating
				// a record.
				redo={
					<RedoCta
						questionId={call.question.id}
						offer={
							call.viewerCanRedo
								? {
										questionShape:
											call.question.shape.toLowerCase() as QuestionCallShape,
										balance: me?.redoBalance ?? 0,
										action: {
											kind: "navigate",
											questionId: call.question.id,
											slug: buildQuestionSlug(call.question.title),
										},
									}
								: null
						}
					/>
				}
				footer={
					<HStack justify="space-between" gap="3" width="full">
						<Link
							to="/questions/$questionId/{-$slug}"
							params={{
								questionId: call.question.id,
								slug: buildQuestionSlug(call.question.title),
							}}
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "primary.default",
								textDecoration: "none",
								_hover: { opacity: 0.8 },
							})}
						>
							See the question →
						</Link>
						<CallShareRow
							callId={call.id}
							shareTitle={call.question.title}
							surface="call_page"
							layout="icons"
							tweetText={buildCallTweet({
								pickLabel: view.pickLabel,
								points: view.points,
								isWin: view.isWin,
								calledAt: view.calledAt,
								...(me?.id === call.user.id
									? ({ isOwn: true } as const)
									: ({ isOwn: false, username: view.username } as const)),
							})}
						/>
					</HStack>
				}
			/>

			{!me && (
				<CallSignupCta
					state={match(view)
						.with({ questionStatus: "OPEN" }, () => ({ kind: "open" }) as const)
						.with({ isWin: true }, () => ({ kind: "hit" }) as const)
						.with({ isWin: false }, () => ({ kind: "miss" }) as const)
						.otherwise(() => ({ kind: "closed" }) as const)}
					username={view.username}
					questionId={call.question.id}
					slug={buildQuestionSlug(call.question.title)}
					leagueSlug={call.question.league.slug}
				/>
			)}

			{/* A signed-in viewer's counterpart to the signup CTA above, in the
			same spot: on someone else's open call, fading it is the one thing
			the page asks them to do. Signed out, the signup CTA already offers
			a call on this question, so this would be a second competing box. */}
			{me && call.fadeOffer && (
				<FadeCta
					callId={call.id}
					questionId={call.question.id}
					opUsername={view.username}
					opPickLabel={view.pickLabel}
					pickLabel={optionDisplayLabel(
						call.fadeOffer.option.label,
						isOverUnderQuestionShape(call.question.shape),
						call.question.ouLine,
						isRateStat(call.question),
					)}
					optionId={call.fadeOffer.option.id}
					mode={call.fadeOffer.mode}
				/>
			)}

			{/* Once a fade settles, the winning side's one gloat, in the same
			spot the fade offer held while the question was open. */}
			{call.viewerGloat &&
				(call.viewerGloat.audience === "DOUBTERS" ? (
					<GloatCta
						audience={{
							kind: "doubters",
							callId: call.id,
							count: call.viewerGloat.count,
						}}
					/>
				) : (
					call.viewerGloat.fadeId && (
						<GloatCta
							audience={{
								kind: "target",
								fadeId: call.viewerGloat.fadeId,
								username: call.viewerGloat.targetUsername ?? view.username,
							}}
						/>
					)
				))}

			{/* Directly under the record, because it is about the record: this
			call's time is the redo's time, and without this the page would
			quietly show the later one as if it were the only one. */}
			{view.redo && <RedoPanel data={view.redo} />}

			{call.streak && (
				<Link
					to="/user/$username/streaks/$league/$family/$mode"
					params={{
						username: call.user.username,
						league: call.question.league.slug,
						family: streakFamilyParam(call.streak.family),
						// A call carries a streak tag only when it extended a run.
						mode: "hot",
					}}
					className={arrowLink({ tone: "quiet" })}
				>
					Part of a {call.streak.length}-call {view.leagueAbbr}{" "}
					{call.streak.familyLabel} streak →
				</Link>
			)}

			{/* The gap between calling something and being right about it is the
			claim this page exists to make, so it's stated in words rather than
			left for the reader to subtract two dates. */}
			{lead && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					{lead}
				</span>
			)}

			<DoubtersPanel
				fades={call.doubters}
				opUsername={view.username}
				formatPick={(label) =>
					optionDisplayLabel(
						label,
						isOverUnderQuestionShape(call.question.shape),
						call.question.ouLine,
						isRateStat(call.question),
					)
				}
			/>
		</VStack>
	)
}
