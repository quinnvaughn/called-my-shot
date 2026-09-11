import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { Fragment } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import { BallotPositionRow } from "#/components/ballots/ballot-position-row"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { BallotUncalledLine } from "#/components/ballots/ballot-uncalled-line"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import { BallotEntryDocument } from "#/graphql/queries/ballots"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	ballotEntryPath,
	formatRecord,
	formatSignedPoints,
} from "#/lib/ballot-entry"
import { pageMeta } from "#/lib/meta"
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
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			ballotEntryQuery(params.ballotSlug, params.username),
		)
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
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param.
				path: `/share/ballots/${ballot.slug}/users/${username}/card.png?v=${entry.calledCount}-${entry.wins}-${entry.losses}-${entry.points}`,
				alt: heading,
			},
		})
	},
})

function RouteComponent() {
	const { ballotSlug, username } = Route.useParams()
	const { data } = useSuspenseQuery(ballotEntryQuery(ballotSlug, username))
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
				<Breadcrumb.Current>@{entry.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{ballot.league.abbreviation}</Tag>
				<PageHeader title={ballot.name} subtitle={`${entry.user.name}'s picks`} />
			</VStack>

			<BallotEntrySummaryCard
				calledCount={entry.calledCount}
				memberCount={ballot.memberCount}
				wins={entry.wins}
				losses={entry.losses}
				points={entry.points}
			/>

			<BallotShareRow
				ballotId={ballot.id}
				ballotSlug={ballot.slug}
				username={entry.user.username}
				shareTitle={`@${entry.user.username}'s ${ballot.name} ballot`}
				surface="entry_page"
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
						{called.map(({ member, call }, i) => (
							<Fragment key={member.id}>
								{member.section &&
									member.section !== called[i - 1]?.member.section && (
										<BallotSectionHeading label={member.section} />
									)}
								<BallotPositionRow member={member} call={call} />
							</Fragment>
						))}
						{notCalledYet.length > 0 && (
							<BallotUncalledLine heading="Not called yet" labels={notCalledYet} />
						)}
						{missed.length > 0 && (
							<BallotUncalledLine heading="Missed" labels={missed} />
						)}
					</VStack>
				</Card>
			</VStack>

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
		</VStack>
	)
}
