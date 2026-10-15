import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { ProgressBar } from "#/components/ui/progress-bar"
import { StatTile } from "./stat-tile"

type Props = {
	calledCount: number
	memberCount: number
	remainingOpenCount: number
	isComplete: boolean
	offFieldCount: number
	contestedCount: number
	fullBallotCount: number
	// On a win-totals ballot: the wins the viewer's picks hand out, against
	// the total the schedule has (see lib/win-total-tracker.ts).
	winsHandedOut?: { total: number; target: number } | null
	// The viewer's own link out to their picks, and the share for it. Same
	// footer the entry page's summary card carries.
	footer?: ReactNode
}

// The ballot detail page's summary card - a progress bar/line plus a 4-stat
// row (called/off-field/contested/full-ballot-completions). All numbers are
// pre-computed by computeBallotProgressStats (#/lib/ballot-progress-stats) -
// this component is pure presentation, no cross-member math of its own.
export function BallotProgressCard({
	calledCount,
	memberCount,
	remainingOpenCount,
	isComplete,
	offFieldCount,
	contestedCount,
	fullBallotCount,
	winsHandedOut,
	footer,
}: Props) {
	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" alignItems="baseline" gap="2">
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
						<span
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							{match({ isComplete, remainingOpenCount })
								.with({ isComplete: true }, () => "Ballot complete")
								.with(
									{ remainingOpenCount: P.number },
									({ remainingOpenCount: n }) =>
										n === 1 ? "1 still open" : `${n} still open`,
								)
								.exhaustive()}
						</span>
					</HStack>
					<ProgressBar value={calledCount} max={memberCount} />
					<HStack
						gap="6"
						flexWrap="wrap"
						className={css({
							paddingTop: "3",
							borderTop: "1px solid {colors.border.default}",
						})}
					>
						<StatTile value={calledCount} label="YOUR CALLS" />
						<StatTile value={offFieldCount} label="OFF THE FIELD" />
						<StatTile value={contestedCount} label="CONTESTED" />
						<StatTile value={fullBallotCount} label="FULL BALLOTS" />
						{winsHandedOut && (
							<StatTile
								value={winsHandedOut.total}
								label={`OF ${winsHandedOut.target} WINS`}
							/>
						)}
					</HStack>
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
