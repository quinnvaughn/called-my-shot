import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { MdBallot } from "react-icons/md"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const BallotCardFragment = graphql(`
	fragment BallotCard_ballot on Ballot {
		id
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
// this only ever shows a progress fraction, never a result. Always tagged
// Official - ballots have no isOfficial column of their own (admin-only to
// create in the first place, see db/schema/ballots.ts), so it's a constant
// here rather than a field read off the data.
export function BallotCard({ ballot: ballotProp }: Props) {
	const ballot = useFragment(BallotCardFragment, ballotProp)
	const calledCount = ballot.viewerCalledCount ?? 0
	const pct =
		ballot.memberCount === 0
			? 0
			: Math.round((calledCount / ballot.memberCount) * 100)

	return (
		<Link to="/ballots/$ballotId" params={{ ballotId: ballot.id }}>
			<Card interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between" alignItems="center" gap="2">
							<HStack gap="2" alignItems="center" minWidth="0">
								<MdBallot
									size={16}
									className={css({ color: "fg.subtle", flexShrink: "0" })}
								/>
								<span
									className={css({
										fontSize: "sm",
										fontWeight: "semibold",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									})}
								>
									{ballot.name}
								</span>
							</HStack>
							<Tag variant="primary">Official</Tag>
						</HStack>
						<div
							className={css({
								height: "1.5",
								borderRadius: "full",
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								overflow: "hidden",
							})}
						>
							<div
								className={css({
									height: "full",
									borderRadius: "full",
									bg: "success.default",
								})}
								style={{ width: `${pct}%` }}
							/>
						</div>
						<HStack
							justify="space-between"
							gap="2"
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							<span>
								{calledCount === ballot.memberCount && ballot.memberCount > 0
									? "All called"
									: `${calledCount} of ${ballot.memberCount} called`}
							</span>
							<span>
								{ballot.nextLocksAt
									? `Locks ${DateTime.fromISO(ballot.nextLocksAt).toRelative()}`
									: "Locked"}
							</span>
						</HStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
