import { Link } from "@tanstack/react-router"
import { ProjectedStandings } from "#/components/ballots/projected-standings/projected-standings"
import { arrowLink } from "#/components/ui/arrow-link"
import type { BallotEntryQuery } from "#/graphql/generated/graphql"
import type { StandingsTeamInput } from "#/lib/projected-standings"
import { questionDetailState } from "#/lib/question-detail-state"

type Ballot = NonNullable<BallotEntryQuery["ballot"]>

type Props = {
	ballot: Ballot
	entry: NonNullable<Ballot["entry"]>
	teams: StandingsTeamInput[]
	gamesPerSeason: number
	isOwn: boolean
}

export function BallotEntryStandings({
	ballot,
	entry,
	teams,
	gamesPerSeason,
	isOwn,
}: Props) {
	return (
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
										m.call && questionDetailState(m.member.question).canCall,
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
				entry.members.every(
					(m) => questionDetailState(m.member.question).canCall,
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
	)
}
