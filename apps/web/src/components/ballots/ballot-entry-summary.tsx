import { Link } from "@tanstack/react-router"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { arrowLink } from "#/components/ui/arrow-link"
import type { BallotEntryQuery } from "#/graphql/generated/graphql"
import { questionDetailState } from "#/lib/question-detail-state"

type Ballot = NonNullable<BallotEntryQuery["ballot"]>

type Props = {
	ballot: Ballot
	entry: NonNullable<Ballot["entry"]>
	isOwn: boolean
}

export function BallotEntrySummary({ ballot, entry, isOwn }: Props) {
	return (
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
						className={arrowLink({ tone: "primary", align: "parent" })}
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
	)
}
