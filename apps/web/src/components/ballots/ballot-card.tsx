import { Link } from "@tanstack/react-router"
import { FiLayers } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"

type Props = {
	ballot: {
		id: string
		name: string
		memberCount: number
		viewerCalledCount: number | null
	}
}

// The league room's Season tab list item - a compact stand-in for however
// many member questions a ballot has, same reasoning as BallotStrip/
// BallotKicker: the ballot itself never resolves, only its members do, so
// this only ever shows a progress fraction, never a result. Always tagged
// Official - ballots have no isOfficial column of their own (admin-only to
// create in the first place, see db/schema/ballots.ts), so it's a constant
// here rather than a field read off the data.
export function BallotCard({ ballot }: Props) {
	const pct =
		ballot.memberCount === 0
			? 0
			: Math.round(((ballot.viewerCalledCount ?? 0) / ballot.memberCount) * 100)

	return (
		<Link to="/ballots/$ballotId" params={{ ballotId: ballot.id }}>
			<Card interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between" alignItems="center" gap="2">
							<HStack gap="2" alignItems="center" minWidth="0">
								<FiLayers
									size={13}
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
								height: "1",
								borderRadius: "full",
								bg: "bg.subtle",
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
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							{match(ballot.viewerCalledCount)
								.with(P.union(null, 0), () =>
									ballot.memberCount === 1
										? "1 question"
										: `${ballot.memberCount} questions`,
								)
								.with(ballot.memberCount, () => "All called")
								.otherwise(
									(calledCount) =>
										`${calledCount} of ${ballot.memberCount} called`,
								)}
						</span>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
