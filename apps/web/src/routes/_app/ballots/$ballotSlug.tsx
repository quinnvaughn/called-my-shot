import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router"
import { DateTime } from "luxon"
import { Fragment } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	BallotCompletionsList,
	BallotCompletionsListFragment,
} from "#/components/ballots/ballot-completions-list"
import { BallotGroupBoards } from "#/components/ballots/ballot-group-boards"
import {
	BallotPositionRow,
	BallotPositionRowFragment,
} from "#/components/ballots/ballot-position-row"
import { BallotProgressCard } from "#/components/ballots/ballot-progress-card"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { ProjectedStandings } from "#/components/ballots/projected-standings"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { Tag } from "#/components/ui/tag"
import { useFragment } from "#/graphql/generated"
import { BallotByRefDocument } from "#/graphql/queries/ballots"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	ballotEntryPath,
	formatRecord,
	formatSignedPoints,
	validateBallotPageSearch,
} from "#/lib/ballot-entry"
import { computeBallotProgressStats } from "#/lib/ballot-progress-stats"
import { pageMeta } from "#/lib/meta"
import { standingsTeams } from "#/lib/projected-standings"
import { questionDetailState } from "#/lib/question-detail-state"
import { isUuid } from "#/lib/uuid"
import { leagueWins } from "#/lib/win-total-tracker"

const ballotQuery = (ref: string) =>
	gqlQueryOptions(BallotByRefDocument, { ref })

// Public - a shared link or a scraper can land here signed out, same as the
// `ballot` query itself (resolves null for anything not published). The
// admin builder at /admin/ballots is a separate, admin-only page for
// assembling one; one person's picks on it live at /ballots/<slug>/<username>.
export const Route = createFileRoute("/_app/ballots/$ballotSlug")({
	component: RouteComponent,
	// The viewer's groups on this ballot. Below xl the rail is hidden and the
	// page carries the same list inline.
	staticData: { rightRail: <BallotRail /> },
	staleTime: 0,
	validateSearch: validateBallotPageSearch,
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entry via useSuspenseQuery.
	loader: async ({ context, params, location }) => {
		const data = await context.queryClient.query(ballotQuery(params.ballotSlug))
		const ballot = data.ballot ?? null

		// Ballots were addressed by uuid before they had slugs, so links shared
		// back then still land here. A 301 thrown from the loader, before any
		// html renders, is what lets a crawler follow through to the meta tags
		// below - same handling the league room gives its own old uuid urls.
		if (ballot && isUuid(params.ballotSlug)) {
			throw redirect({
				href:
					location.pathname.replace(params.ballotSlug, ballot.slug) +
					location.searchStr,
				statusCode: 301,
			})
		}

		return { ballot }
	},
	head: ({ loaderData }) => {
		const ballot = loaderData?.ballot
		if (!ballot) return {}
		// Always the slug url, never the uuid one a request may have arrived
		// on, so the old links consolidate onto this one rather than being
		// indexed twice.
		return pageMeta({
			title: `${ballot.name} · Called My Shot`,
			description: `${ballot.memberCount} question${ballot.memberCount === 1 ? "" : "s"} in the ${ballot.league.name} ${ballot.name}.`,
			path: `/ballots/${ballot.slug}`,
		})
	},
})

// Reads the cache entry RouteComponent loads, so the rail moves with the page
// rather than fetching on its own.
function BallotRail() {
	const { ballotSlug } = Route.useParams()
	const { data } = useSuspenseQuery(ballotQuery(ballotSlug))
	const ballot = data.ballot
	if (!ballot) return null
	return (
		<BallotGroupBoards
			ballotId={ballot.id}
			ballotSlug={ballot.slug}
			boards={ballot.viewerGroupBoards}
		/>
	)
}

function RouteComponent() {
	const { ballotSlug } = Route.useParams()
	const { view } = Route.useSearch()
	const navigate = Route.useNavigate()
	const queryClient = useQueryClient()
	const { data } = useSuspenseQuery(ballotQuery(ballotSlug))
	const { me } = useRouteContext({ from: "__root__" })
	const ballot = data.ballot

	// Unmasked once here (not per-row) - the server already returns members
	// in sortOrder (see BallotRef.members' orderBy), so no client-side sort
	// is needed either. useFragment is a plain data transform, not a real
	// hook, but is still named/tripped up like one by the top-level-hook-call
	// lint, so both calls happen unconditionally before the not-found branch
	// below rather than after it.
	const members = useFragment(BallotPositionRowFragment, ballot?.members ?? [])
	const completions = useFragment(
		BallotCompletionsListFragment,
		ballot?.completions,
	)

	if (!ballot) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Ballot"
				heading="This ballot doesn't exist"
				subtitle="It may not be published yet, or the link's just wrong."
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	// The viewer's own picks as standings, on a win-totals ballot. Signed
	// out or before any picks, every team reads as unpicked.
	const teams = standingsTeams(
		ballot.league.slug,
		ballot.members.map((m) => ({
			questionId: m.question.id,
			team: m.question.subjectTeam,
			statName: m.question.stat?.name,
			wins: m.question.viewerCall?.guessValue,
			tiebreakPosition: m.viewerTiebreakPosition,
			conviction: m.question.viewerCall?.conviction,
			rebalancedFrom: m.question.viewerCall?.rebalancedFrom,
			callId: null,
		})),
	)
	const gamesPerSeason = ballot.league.seasonFormat?.gamesPerSeason
	const showStandings = Boolean(teams && gamesPerSeason)

	const stats = computeBallotProgressStats(
		members.map((member, i) => ({
			...member,
			call: ballot.members[i].question.viewerCall,
		})),
	)
	const record = {
		wins: stats.states.filter((s) => s === "won").length,
		losses: stats.states.filter((s) => s === "lost").length,
		points: ballot.members.reduce(
			(sum, m) => sum + (m.question.viewerCall?.totalPoints ?? 0),
			0,
		),
	}

	// The soonest still-upcoming lock across every member - a member already
	// past its own locksAt (open-and-called, or resolved) has nothing left to
	// warn about here, so it's excluded rather than dragging the ballot-level
	// line back into the past.
	const now = DateTime.now()
	const upcomingLocks = members
		.map((m) => DateTime.fromISO(m.question.locksAt))
		.filter((dt) => dt > now)
	const soonestLock =
		upcomingLocks.length > 0
			? upcomingLocks.reduce((a, b) => (b < a ? b : a))
			: null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug"
					params={{ leagueSlug: ballot.league.slug }}
				>
					{ballot.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug/ballots"
					params={{ leagueSlug: ballot.league.slug }}
				>
					Ballots
				</Breadcrumb.Link>
				<Breadcrumb.Current>{ballot.name}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader
					title={ballot.name}
					subtitle={
						ballot.memberCount === 1
							? "1 question"
							: `${ballot.memberCount} questions`
					}
				/>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					{soonestLock
						? `Locks ${soonestLock.toRelative()}`
						: "All positions locked"}
				</span>
			</VStack>

			<BallotProgressCard
				calledCount={stats.calledCount}
				memberCount={ballot.memberCount}
				remainingOpenCount={stats.remainingOpenCount}
				isComplete={stats.isComplete}
				offFieldCount={stats.offFieldCount}
				contestedCount={stats.contestedCount}
				fullBallotCount={completions?.count ?? 0}
				winsHandedOut={
					showStandings && gamesPerSeason && ballot.viewerGuessSum != null
						? {
								total: ballot.viewerGuessSum,
								target: leagueWins(gamesPerSeason, ballot.memberCount),
							}
						: null
				}
				footer={
					me &&
					stats.calledCount > 0 && (
						<>
							<Link
								to={ballotEntryPath(ballot.slug, me.username)}
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
								{/* The card above already counts the calls, so the
								    link only adds the record once one settles. */}
								{record.wins + record.losses > 0 &&
									`${formatRecord(record.wins, record.losses)} · ${formatSignedPoints(record.points)} pts · `}
								See your picks →
							</Link>
							<BallotShareRow
								ballotId={ballot.id}
								ballotSlug={ballot.slug}
								username={me.username}
								shareTitle={`@${me.username}'s ${ballot.name} ballot`}
								surface="ballot_page"
								layout="icons"
								tweetText={buildBallotTweet({
									ballotName: ballot.name,
									calledCount: stats.calledCount,
									memberCount: ballot.memberCount,
									...record,
									isOwn: true,
								})}
							/>
						</>
					)
				}
			/>

			{stats.nextUncalled && (
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{ questionId: stats.nextUncalled.question.id }}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "1.5",
						width: "full",
						backgroundColor: "bg.subtle",
						border: "1px solid {colors.primary.default}",
						borderRadius: "lg",
						paddingBlock: "3",
						fontFamily: "mono",
						fontSize: "xs",
						fontWeight: "bold",
						letterSpacing: "wide",
						color: "primary.default",
						_hover: { backgroundColor: "primary.subtle" },
					})}
				>
					<span className={css({ textTransform: "uppercase" })}>
						Continue ballot · Next:{" "}
						{stats.nextUncalled.slot || stats.nextUncalled.label}
					</span>
					<FiChevronRight />
				</Link>
			)}

			{showStandings && (
				<Tabs
					value={view ?? "questions"}
					onValueChange={(next) =>
						navigate({
							search: next === "standings" ? { view: "standings" } : {},
							replace: true,
							resetScroll: false,
						})
					}
				>
					<Tabs.List stretch>
						<Tabs.Trigger value="questions">Questions</Tabs.Trigger>
						<Tabs.Trigger value="standings">Standings</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			)}

			{showStandings && view === "standings" && teams && gamesPerSeason ? (
				<ProjectedStandings
					leagueSlug={ballot.league.slug}
					leagueAbbreviation={ballot.league.abbreviation}
					gamesPerSeason={gamesPerSeason}
					teams={teams}
					reorderableQuestionIds={
						new Set(
							me
								? ballot.members
										.filter(
											(m, i) =>
												m.question.viewerCall &&
												questionDetailState(members[i].question).canCall,
										)
										.map((m) => m.question.id)
								: [],
						)
					}
					ownerLabel="Your picks"
					editing={{
						ballotId: ballot.id,
						onSaved: () =>
							queryClient.invalidateQueries({
								queryKey: ballotQuery(ballotSlug).queryKey,
							}),
					}}
				/>
			) : (
				<VStack gap="3" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							textTransform: "uppercase",
						})}
					>
						Questions
					</span>
					<Card>
						<VStack gap="0" alignItems="stretch">
							{ballot.members.map((member, i) => {
								// Rendered from the still-masked ballot.members (passed
								// straight through, unmasked again inside
								// BallotPositionRow) - members[i] is the same list
								// already unmasked above for the id this needs as a key,
								// and for the section heading below.
								const section = members[i].section
								return (
									<Fragment key={members[i].id}>
										{section && section !== members[i - 1]?.section && (
											<BallotSectionHeading label={section} />
										)}
										<BallotPositionRow
											member={member}
											call={member.question.viewerCall}
										/>
									</Fragment>
								)
							})}
						</VStack>
					</Card>
				</VStack>
			)}

			{ballot.viewerGroupBoards.length > 0 && (
				<div className={css({ display: { base: "block", xl: "none" } })}>
					<BallotGroupBoards
						ballotId={ballot.id}
						ballotSlug={ballot.slug}
						boards={ballot.viewerGroupBoards}
					/>
				</div>
			)}

			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						textTransform: "uppercase",
					})}
				>
					Completed ballots
				</span>
				<BallotCompletionsList
					summary={ballot.completions}
					ballotSlug={ballot.slug}
				/>
			</VStack>
		</VStack>
	)
}
