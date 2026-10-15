import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotEntryHeader } from "#/components/ballots/ballot-entry-header"
import { BallotEntryStandings } from "#/components/ballots/ballot-entry-standings"
import { BallotEntrySummary } from "#/components/ballots/ballot-entry-summary"
import { EntryCallList } from "#/components/ballots/entry-call-list"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { BallotEntryDocument } from "#/graphql/ballots/queries"
import { groupCrumbQuery } from "#/graphql/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import {
	ballotEntryPath,
	ballotEntrySearchSchema,
	picksVersion,
} from "#/lib/ballot-entry"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import { standingsTeams } from "#/lib/projected-standings"
import { questionDetailState } from "#/lib/question-detail-state"

const ballotEntryQuery = (ref: string, username: string) =>
	gqlQueryOptions(BallotEntryDocument, { ref, username })

// Public, like the ballot page and /calls/:id - this url exists to be pasted
// somewhere. Not a child of /ballots/$ballotSlug (that page has no outlet),
// hence the trailing underscore. Left out of the sitemap for the same reason
// calls are: one person's picks aren't something to index.
export const Route = createFileRoute("/_app/ballots/$ballotSlug_/$username")({
	component: RouteComponent,
	staleTime: 0,
	validateSearch: ballotEntrySearchSchema,
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
						`${formatSigned(entry.points, { zeroSign: true })} pts`,
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
	const me = useMe()
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
			<BallotEntryHeader
				ballot={ballot}
				entry={entry}
				crumbGroup={crumbGroup}
			/>

			<BallotEntrySummary ballot={ballot} entry={entry} isOwn={isOwn} />
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
				<BallotEntryStandings
					ballot={ballot}
					entry={entry}
					teams={teams}
					gamesPerSeason={gamesPerSeason}
					isOwn={isOwn}
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
