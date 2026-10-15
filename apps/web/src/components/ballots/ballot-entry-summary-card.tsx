import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameVerdictStamp } from "#/components/games/game-verdict-stamp"
import { RecordByline } from "#/components/records/record-byline"
import { RecordStat } from "#/components/records/record-stat"
import { RecordTag } from "#/components/records/record-tag"
import { Card } from "#/components/ui/card"
import { ProgressBar } from "#/components/ui/progress-bar"
import type { GameEntryVerdict } from "#/graphql/generated/graphql"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import type { RecordTone } from "#/lib/record-tag"
import { BallotEntrySplitRow, type SplitRecord } from "./ballot-entry-split-row"

type Props = {
	person: { name: string; username: string; avatarUrl: string | null }
	calledCount: number
	memberCount: number
	wins: number
	losses: number
	points: number
	// Whether any of the entry's questions can still be called. Until
	// something settles, the tag says this the way a single call's does:
	// Open while picks can still be added, Locked once they're all frozen.
	isOpen: boolean
	// Game entries only: set once a final game's official questions were
	// called all right or all wrong. A ballot never carries one.
	verdict?: GameEntryVerdict | null
	// Game entries with community calls: the record and points above split
	// into the official slate and the community questions called alongside
	// it. The verdict reads off the official half alone, which is the one
	// everyone had the same questions in.
	splits?: { official: SplitRecord; community: SplitRecord } | null
	// The entry's share row and the link back to what it's an entry in. The
	// entry page is the thing its link points at, so the share sits on the
	// card that summarises it.
	footer?: ReactNode
}

// The centrepiece of an entry page (a game's official questions, a ballot),
// laid out like CallRecordCard: whose it is and how it stands across the
// top, the points at the call page's scale, then how much of it is called.
export function BallotEntrySummaryCard({
	person,
	calledCount,
	memberCount,
	wins,
	losses,
	points,
	isOpen,
	verdict,
	splits,
	footer,
}: Props) {
	const isComplete = calledCount === memberCount && memberCount > 0
	const hasSettled = wins + losses > 0
	const pointsTone = points >= 0 ? "success" : "danger"

	// The verdict outranks the bare record: it is the rarer claim, and says
	// the record in a word.
	const standing: { tone: RecordTone; label: string } = verdict
		? verdict === "PERFECT"
			? { tone: "success", label: "Perfect card" }
			: { tone: "danger", label: "Oh-fer" }
		: hasSettled
			? { tone: pointsTone, label: formatRecord(wins, losses) }
			: { tone: "pending", label: isOpen ? "Open" : "Locked" }

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="stretch" width="full">
					<HStack justify="space-between" gap="3" alignItems="center">
						<RecordByline
							name={person.name}
							username={person.username}
							avatarUrl={person.avatarUrl}
						/>
						<RecordTag tone={standing.tone}>{standing.label}</RecordTag>
					</HStack>
					{hasSettled && (
						<RecordStat
							value={formatSigned(points, { zeroSign: true })}
							label="Points"
							tone={pointsTone}
						/>
					)}
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{/* A game with no official questions has no slate to fill. */}
					{memberCount > 0 && (
						<>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "sm",
									fontWeight: "bold",
									letterSpacing: "wide",
									color: isComplete ? "secondary.default" : "fg.default",
								})}
							>
								{/* Community calls aren't part of the slate this counts,
								so with any on the page it says which questions it means. */}
								{calledCount} OF {memberCount}
								{splits ? " OFFICIAL QUESTIONS" : ""} CALLED
							</span>
							<ProgressBar value={calledCount} max={memberCount} />
						</>
					)}
					{splits && (
						<VStack
							gap="2"
							alignItems="stretch"
							className={css({
								paddingTop: "3",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<BallotEntrySplitRow label="Official" record={splits.official} />
							<BallotEntrySplitRow
								label="Community"
								record={splits.community}
							/>
						</VStack>
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
