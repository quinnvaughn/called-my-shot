import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	BallotCompletionsList,
	BallotCompletionsListFragment,
} from "#/components/ballots/ballot-completions-list"
import { BallotGroupBoards } from "#/components/ballots/ballot-group-boards"
import { BallotPageHeader } from "#/components/ballots/ballot-page-header"
import { BallotPageProgress } from "#/components/ballots/ballot-page-progress"
import { BallotPositionRowFragment } from "#/components/ballots/ballot-position-row"
import { BallotQuestionList } from "#/components/ballots/ballot-question-list"
import { ProjectedStandings } from "#/components/ballots/projected-standings/projected-standings"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { BallotByRefDocument } from "#/graphql/ballots/queries"
import { useFragment } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { ballotPageSearchSchema } from "#/lib/ballot-entry"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
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
	validateSearch: ballotPageSearchSchema,
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
			description: `${ballot.memberCount} ${pluralize(ballot.memberCount, "question")} in the ${ballot.league.name} ${ballot.name}.`,
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
	const me = useMe()
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
				link={{ text: "Back home", url: "/" }}
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

	// The soonest still-upcoming lock across every member - a member already
	// past its own locksAt (open-and-called, or resolved) has nothing left to
	// warn about here, so it's excluded rather than dragging the ballot-level
	// line back into the past.
	const now = DateTime.now()
	const upcomingLocks = members
		.map((m) => m.question.locksAt)
		.filter((locksAt) => DateTime.fromISO(locksAt) > now)
	const soonestLock =
		upcomingLocks.length > 0
			? upcomingLocks.reduce((a, b) =>
					DateTime.fromISO(b) < DateTime.fromISO(a) ? b : a,
				)
			: null

	return (
		<VStack gap="6" alignItems="stretch">
			<BallotPageHeader ballot={ballot} soonestLock={soonestLock} />

			<BallotPageProgress
				ballot={ballot}
				members={members}
				fullBallotCount={completions?.count ?? 0}
				winsHandedOut={
					showStandings && gamesPerSeason && ballot.viewerGuessSum != null
						? {
								total: ballot.viewerGuessSum,
								target: leagueWins(gamesPerSeason, ballot.memberCount),
							}
						: null
				}
				viewerUsername={me?.username ?? null}
			/>

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
				<BallotQuestionList ballot={ballot} members={members} />
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
						textStyle: "label",
						color: "fg.subtle",
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
