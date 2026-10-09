import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { EntryCallList } from "#/components/ballots/entry-call-list"
import { ProjectedStandings } from "#/components/ballots/projected-standings"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { Tag } from "#/components/ui/tag"
import { BallotEntryDocument } from "#/graphql/queries/ballots"
import { GroupCrumbDocument } from "#/graphql/queries/groups"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	ballotEntryPath,
	formatRecord,
	formatSignedPoints,
	validateBallotEntrySearch,
} from "#/lib/ballot-entry"
import { pageMeta } from "#/lib/meta"
import { standingsTeams } from "#/lib/projected-standings"
import { questionDetailState } from "#/lib/question-detail-state"

const ballotEntryQuery = (ref: string, username: string) =>
	gqlQueryOptions(BallotEntryDocument, { ref, username })

const groupCrumbQuery = (groupId: string) =>
	gqlQueryOptions(GroupCrumbDocument, { groupId })

// Public, like the ballot page and /calls/:id - this url exists to be pasted
// somewhere. Not a child of /ballots/$ballotSlug (that page has no outlet),
// hence the trailing underscore. Left out of the sitemap for the same reason
// calls are: one person's picks aren't something to index.
export const Route = createFileRoute("/_app/ballots/$ballotSlug_/$username")({
	component: RouteComponent,
	staleTime: 0,
	validateSearch: validateBallotEntrySearch,
	loaderDeps: ({ search }) => ({ group: search.group }),
	loader: async ({ context, params, deps }) => {
		const [data] = await Promise.all([
			context.queryClient.query(
				ballotEntryQuery(params.ballotSlug, params.username),
			),
			deps.group
				? context.queryClient.query(groupCrumbQuery(deps.group))
				: null,
		])
		return { ballot: data.ballot ?? null }
	},
	head: ({ loaderData }) => {
		const ballot = loaderData?.ballot
		const entry = ballot?.entry
		if (!ballot || !entry) return {}

		const { username } = entry.user
		const outcome =
			entry.wins + entry.losses > 0
				? [
						formatRecord(entry.wins, entry.losses),
						`${formatSignedPoints(entry.points)} pts`,
					]
				: []

		// Ballot names don't carry their league ("2026 Win Totals"), so the
		// title does.
		const heading = `@${username}'s ${ballot.name} · ${ballot.league.abbreviation}`

		return pageMeta({
			title: heading,
			description: [
				`${entry.calledCount} of ${ballot.memberCount} called`,
				...outcome,
			].join(" · "),
			path: ballotEntryPath(ballot.slug, username),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. A
				// win-totals card shows picks too, so a rebalance or a reordered
				// tie changes it as well. The proxy route ignores the param.
				path: `/share/ballots/${ballot.slug}/users/${username}/card.png?v=${entry.calledCount}-${entry.wins}-${entry.losses}-${entry.points}-${picksVersion(entry.members)}`,
				alt: heading,
			},
		})
	},
})

// A short fingerprint of every pick's number and tie order, for the card
// url's version param above.
function picksVersion(
	members: {
		call: { guessValue?: number | null } | null
		tiebreakPosition?: number | null
	}[],
): string {
	let hash = 0
	for (const m of members) {
		const part = `${m.call?.guessValue ?? ""}:${m.tiebreakPosition ?? ""};`
		for (const char of part) {
			hash = (hash * 31 + char.charCodeAt(0)) >>> 0
		}
	}
	return hash.toString(36)
}

function RouteComponent() {
	const { ballotSlug, username } = Route.useParams()
	const { view, group: groupId } = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery(ballotEntryQuery(ballotSlug, username))
	// Set when opened from a group's ballot board. Ignored when the viewer
	// can't see the group.
	const { data: crumbData } = useQuery({
		...groupCrumbQuery(groupId ?? ""),
		enabled: groupId !== undefined,
	})
	const crumbGroup = groupId ? (crumbData?.group ?? null) : null
	const { me } = useRouteContext({ from: "__root__" })
	const ballot = data.ballot

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

	const entry = ballot.entry
	if (!entry) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Ballot"
				heading="No picks here"
				subtitle={`@${username} hasn't made any calls on ${ballot.name}.`}
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	const isOwn = me?.id === entry.user.id

	// Only called members get a row. The rest are summed up underneath, split
	// by whether they can still be called, so a ballot shared early isn't a
	// long run of empty rows.
	const called = entry.members.filter((m) => m.call !== null)
	const uncalled = entry.members.filter((m) => m.call === null)
	const uncalledLabels = (open: boolean) =>
		uncalled
			.filter((m) => questionDetailState(m.member.question).canCall === open)
			.map((m) => m.member.slot || m.member.label)
	const notCalledYet = uncalledLabels(true)
	const missed = uncalledLabels(false)

	const teams = standingsTeams(
		ballot.league.slug,
		entry.members.map((m) => ({
			questionId: m.member.question.id,
			team: m.member.question.subjectTeam,
			statName: m.member.question.stat?.name,
			wins: m.call?.guessValue,
			tiebreakPosition: m.tiebreakPosition,
			conviction: m.call?.conviction,
			rebalancedFrom: m.call?.rebalancedFrom,
			callId: m.call?.id,
		})),
	)
	const gamesPerSeason = ballot.league.seasonFormat?.gamesPerSeason
	const showStandings = Boolean(teams && gamesPerSeason)
	const tab = showStandings && view !== "picks" ? "standings" : "picks"

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				{crumbGroup ? (
					<>
						<Breadcrumb.Link
							to="/groups/$groupId"
							params={{ groupId: crumbGroup.id }}
						>
							{crumbGroup.name}
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/groups/$groupId/ballots/$ballotSlug"
							params={{ groupId: crumbGroup.id, ballotSlug: ballot.slug }}
						>
							{ballot.name}
						</Breadcrumb.Link>
					</>
				) : (
					<>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug"
							params={{ leagueSlug: ballot.league.slug }}
						>
							{ballot.league.abbreviation}
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug/season"
							params={{ leagueSlug: ballot.league.slug }}
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
				)}
				<Breadcrumb.Current>@{entry.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader
					title={ballot.name}
					subtitle={`${entry.user.name}'s picks`}
				/>
			</VStack>

			<BallotEntrySummaryCard
				person={entry.user}
				calledCount={entry.calledCount}
				memberCount={ballot.memberCount}
				wins={entry.wins}
				losses={entry.losses}
				points={entry.points}
				isOpen={entry.members.some(
					(m) => questionDetailState(m.member.question).canCall,
				)}
				footer={
					<>
						<Link
							to="/ballots/$ballotSlug"
							params={{ ballotSlug: ballot.slug }}
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
							{isOwn ? "Back to the ballot →" : "Fill out your own ballot →"}
						</Link>
						<BallotShareRow
							ballotId={ballot.id}
							ballotSlug={ballot.slug}
							username={entry.user.username}
							shareTitle={`@${entry.user.username}'s ${ballot.name} ballot`}
							surface="entry_page"
							layout="icons"
							tweetText={buildBallotTweet({
								ballotName: ballot.name,
								calledCount: entry.calledCount,
								memberCount: ballot.memberCount,
								wins: entry.wins,
								losses: entry.losses,
								points: entry.points,
								...(isOwn
									? ({ isOwn: true } as const)
									: ({ isOwn: false, username: entry.user.username } as const)),
							})}
						/>
					</>
				}
			/>
			{showStandings && (
				<Tabs
					value={tab}
					onValueChange={(next) =>
						navigate({
							search: (prev) => ({
								group: prev.group,
								...(next === "picks" ? { view: "picks" as const } : {}),
							}),
							replace: true,
							resetScroll: false,
						})
					}
				>
					<Tabs.List stretch>
						<Tabs.Trigger value="standings">Standings</Tabs.Trigger>
						<Tabs.Trigger value="picks">Picks</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			)}

			{tab === "standings" && teams && gamesPerSeason ? (
				<ProjectedStandings
					leagueSlug={ballot.league.slug}
					leagueAbbreviation={ballot.league.abbreviation}
					gamesPerSeason={gamesPerSeason}
					teams={teams}
					reorderableQuestionIds={
						new Set(
							isOwn
								? entry.members
										.filter(
											(m) =>
												m.call &&
												questionDetailState(m.member.question).canCall,
										)
										.map((m) => m.member.question.id)
								: [],
						)
					}
					ownerLabel={isOwn ? "Your picks" : `@${entry.user.username}'s picks`}
					// The page others are sent to stays a clean view of the
					// standings, owner included; ties get ordered on the ballot.
					editing={null}
					orderElsewhere={
						<Link
							to="/ballots/$ballotSlug"
							params={{ ballotSlug: ballot.slug }}
							search={{ view: "standings" }}
							className={arrowLink({ tone: "primary" })}
						>
							Order your tied teams on the ballot →
						</Link>
					}
					rebalanceElsewhere={
						isOwn &&
						entry.members.every((m) =>
							questionDetailState(m.member.question).canCall,
						) && (
							<Link
								to="/ballots/$ballotSlug"
								params={{ ballotSlug: ballot.slug }}
								search={{ view: "standings" }}
								className={arrowLink({ tone: "primary" })}
							>
								Rebalance on the ballot →
							</Link>
						)
					}
				/>
			) : (
				<EntryCallList
					rows={called.flatMap(({ member, call }) =>
						call
							? [{ key: member.id, section: member.section ?? null, call }]
							: [],
					)}
					fallbackLabel="Questions"
					notCalledYet={notCalledYet}
					missed={missed}
				/>
			)}
		</VStack>
	)
}
