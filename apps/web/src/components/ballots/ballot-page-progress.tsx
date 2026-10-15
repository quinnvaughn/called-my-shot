import { Link } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { BallotProgressCard } from "#/components/ballots/ballot-progress-card"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { arrowLink } from "#/components/ui/arrow-link"
import type {
	BallotByRefQuery,
	BallotPositionRow_MemberFragment,
} from "#/graphql/generated/graphql"
import { ballotEntryPath } from "#/lib/ballot-entry"
import { computeBallotProgressStats } from "#/lib/ballot-progress-stats"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"

type Props = {
	ballot: NonNullable<BallotByRefQuery["ballot"]>
	// ballot.members unmasked, in the same order.
	members: BallotPositionRow_MemberFragment[]
	fullBallotCount: number
	winsHandedOut: ComponentProps<typeof BallotProgressCard>["winsHandedOut"]
	// Null when signed out.
	viewerUsername: string | null
}

// The viewer's progress through the ballot, and the way back into it at the
// next position they haven't called.
export function BallotPageProgress({
	ballot,
	members,
	fullBallotCount,
	winsHandedOut,
	viewerUsername,
}: Props) {
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

	return (
		<>
			<BallotProgressCard
				calledCount={stats.calledCount}
				memberCount={ballot.memberCount}
				remainingOpenCount={stats.remainingOpenCount}
				isComplete={stats.isComplete}
				offFieldCount={stats.offFieldCount}
				contestedCount={stats.contestedCount}
				fullBallotCount={fullBallotCount}
				winsHandedOut={winsHandedOut}
				footer={
					viewerUsername &&
					stats.calledCount > 0 && (
						<>
							<Link
								to={ballotEntryPath(ballot.slug, viewerUsername)}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								{/* The card above already counts the calls, so the
								    link only adds the record once one settles. */}
								{record.wins + record.losses > 0 &&
									`${formatRecord(record.wins, record.losses)} · ${formatSigned(record.points, { zeroSign: true })} pts · `}
								See your picks →
							</Link>
							<BallotShareRow
								ballotId={ballot.id}
								ballotSlug={ballot.slug}
								username={viewerUsername}
								shareTitle={`@${viewerUsername}'s ${ballot.name} ballot`}
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
		</>
	)
}
