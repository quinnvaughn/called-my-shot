import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { StatTile } from "#/components/ballots/ballot-progress-card"
import { GameVerdictStamp } from "#/components/games/game-verdict-stamp"
import { Card } from "#/components/ui/card"
import type { GameEntryVerdict } from "#/graphql/generated/graphql"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"

type Props = {
	calledCount: number
	memberCount: number
	wins: number
	losses: number
	points: number
	// Game entries only: set once a final game was called all right or all
	// wrong. A ballot never carries one.
	verdict?: GameEntryVerdict | null
	// The entry's share row and the link back to what it's an entry in. The
	// entry page is the thing its link points at, so the share sits on the
	// card that summarises it.
	footer?: ReactNode
}

// The entry page's counterpart to BallotProgressCard. That card's other
// stats (off the field, contested, full ballots) describe the ballot from
// the viewer's seat; this one describes someone's entry, so it's how much
// they called and, once members settle, how it's going.
export function BallotEntrySummaryCard({
	calledCount,
	memberCount,
	wins,
	losses,
	points,
	verdict,
	footer,
}: Props) {
	const pct =
		memberCount === 0 ? 0 : Math.round((calledCount / memberCount) * 100)
	const isComplete = calledCount === memberCount && memberCount > 0
	const hasSettled = wins + losses > 0

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
							letterSpacing: "wide",
							color: isComplete ? "secondary.default" : "fg.default",
						})}
					>
						{calledCount} OF {memberCount} CALLED
					</span>
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
								bg: "secondary.default",
							})}
							style={{ width: `${pct}%` }}
						/>
					</div>
					{hasSettled && (
						<HStack
							gap="6"
							flexWrap="wrap"
							className={css({
								paddingTop: "3",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<StatTile value={formatRecord(wins, losses)} label="RECORD" />
							<StatTile value={formatSignedPoints(points)} label="POINTS" />
						</HStack>
					)}
					{verdict && (
						<div
							className={css({
								paddingTop: "3",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<GameVerdictStamp verdict={verdict} />
						</div>
					)}
				</VStack>
			</Card.Body>
			{footer && (
				<Card.Footer>
					<HStack justify="space-between" gap="3" width="full">
						{footer}
					</HStack>
				</Card.Footer>
			)}
		</Card>
	)
}
