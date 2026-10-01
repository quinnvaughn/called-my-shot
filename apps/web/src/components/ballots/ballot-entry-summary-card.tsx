import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameVerdictStamp } from "#/components/games/game-verdict-stamp"
import {
	RecordStat,
	RecordTag,
	type RecordTone,
} from "#/components/questions/call-record-card"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import type { GameEntryVerdict } from "#/graphql/generated/graphql"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"

type Props = {
	person: { name: string; username: string; avatarUrl: string | null }
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
	verdict,
	footer,
}: Props) {
	const pct =
		memberCount === 0 ? 0 : Math.round((calledCount / memberCount) * 100)
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
			: { tone: "pending", label: "On the record" }

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="stretch" width="full">
					<HStack justify="space-between" gap="3" alignItems="center">
						<Link
							to="/user/$username"
							params={{ username: person.username }}
							className={css({
								display: "inline-flex",
								alignItems: "center",
								gap: "2",
								minWidth: "0",
								textDecoration: "none",
								color: "fg.default",
								_hover: { "& span": { textDecoration: "underline" } },
							})}
						>
							<Avatar size="xs" name={person.name} src={person.avatarUrl} />
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								@{person.username}
							</span>
						</Link>
						<RecordTag tone={standing.tone}>{standing.label}</RecordTag>
					</HStack>
					{hasSettled && (
						<RecordStat
							value={formatSignedPoints(points)}
							label="Points"
							tone={pointsTone}
						/>
					)}
				</VStack>
			</Card.Header>
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
