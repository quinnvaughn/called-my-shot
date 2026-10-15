import { Link } from "@tanstack/react-router"
import { MdBallot } from "react-icons/md"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { LockLine } from "#/components/questions/lock-line"
import { Card } from "#/components/ui/card"
import { ProgressBar } from "#/components/ui/progress-bar"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const BallotCardFragment = graphql(`
	fragment BallotCard_ballot on Ballot {
		id
		slug
		name
		memberCount
		viewerCalledCount
		nextLocksAt
	}
`)

type Props = {
	ballot: FragmentType<typeof BallotCardFragment>
}

// The league room's Season tab list item - a compact stand-in for however
// many member questions a ballot has, same reasoning as BallotStrip/
// BallotKicker: the ballot itself never resolves, only its members do, so
// this only ever shows a progress fraction, never a result.
export function BallotCard({ ballot: ballotProp }: Props) {
	const ballot = useFragment(BallotCardFragment, ballotProp)
	const calledCount = ballot.viewerCalledCount ?? 0

	return (
		<Link to="/ballots/$ballotSlug" params={{ ballotSlug: ballot.slug }}>
			<Card interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack gap="2" alignItems="center" minWidth="0">
							<MdBallot
								size={16}
								className={css({ color: "fg.subtle", flexShrink: "0" })}
							/>
							<span
								className={css({
									fontSize: "sm",
									fontWeight: "semibold",
									truncate: true,
								})}
							>
								{ballot.name}
							</span>
						</HStack>
						<ProgressBar value={calledCount} max={ballot.memberCount} />
						<HStack
							justify="space-between"
							gap="2"
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							<span>
								{calledCount === ballot.memberCount && ballot.memberCount > 0
									? "All called"
									: `${calledCount} of ${ballot.memberCount} called`}
							</span>
							<span>
								{ballot.nextLocksAt ? (
									<LockLine status="OPEN" locksAt={ballot.nextLocksAt} />
								) : (
									"Locked"
								)}
							</span>
						</HStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
