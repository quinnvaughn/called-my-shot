import { quipForCall } from "@called-my-shot/scoring"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	CallRecordCard,
	type CallRecordCardData,
} from "#/components/questions/call-record-card"
import {
	buildCallTweet,
	CallShareRow,
} from "#/components/questions/call-share-row"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import type { CallRecordQuery } from "#/graphql/generated/graphql"
import { callRecordQuery } from "#/graphql/queries/call"
import { callCardVersion, callPageMeta } from "#/lib/call-meta"
import { pickSummary } from "#/lib/call-summary"
import { formatGuess, isRateStat } from "#/lib/field-signal"
import { formatCallDate, formatCallLead } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"
import {
	isNumericQuestionShape,
	shareCardShapeLabel,
} from "#/lib/question-labels"
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

	const pickLabel = pickSummary({
		guessValue: call.guessValue,
		conviction: call.conviction,
		totalPoints: call.totalPoints,
		question: {
			shape: call.question.shape,
			ouLine: call.question.ouLine,
			numericActualValue: call.question.numericActualValue,
			numericToleranceAbsolute: call.question.numericToleranceAbsolute,
			stat: call.question.stat,
		},
		selections: call.selections.map((s) => ({
			id: s.id,
			conviction: s.conviction,
			option: { label: s.option.label, isCorrect: s.option.isCorrect },
		})),
	})

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

	return {
		pickLabel,
		points,
		isWin,
		fieldPct,
		closeness,
		conviction,
		username: call.user.username,
		name: call.user.name,
		leagueAbbr: call.question.league.abbreviation.toUpperCase(),
		calledAt: formatCallDate(call.createdAt),
		questionStatus: call.question.status,
		locksAt: call.question.locksAt,
		resolvedAt: call.question.resolvedAt,
	}
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
		questionTitle: call.question.title,
		leagueAbbr: view.leagueAbbr,
		categoryLabel: shareCardShapeLabel[call.question.shape],
		name: view.name,
		username: view.username,
		pickLabel: view.pickLabel,
		calledAt: view.calledAt,
		isWin: view.isWin,
		points: view.points,
		fieldPct: view.fieldPct,
		closeness: view.closeness,
		conviction: view.conviction,
		caseText: call.caseText,
		streakLength: call.streak?.length ?? null,
		// Deterministic off the call's own id, so the page and the og:image
		// (which calls the same function against the same id) always show the
		// same line, and neither has to persist it.
		quip: resolved ? quipForCall(call.id, view.isWin === true) : null,
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

			{/* Names the page and nothing else. Who called it, when, in which
			league, on what kind of question - the card below states all of it,
			and a subtitle here would only say it twice. */}
			<PageHeader title="The Call" />

			<CallRecordCard data={cardData} />

			{call.streak && (
				<Link
					to="/user/$username/streaks/$league/$family"
					params={{
						username: call.user.username,
						league: call.question.league.slug,
						family: streakFamilyParam(call.streak.family),
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

			<CallShareRow
				callId={call.id}
				shareTitle={call.question.title}
				surface="call_page"
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
				See the question and everyone else who called it →
			</Link>
		</VStack>
	)
}
