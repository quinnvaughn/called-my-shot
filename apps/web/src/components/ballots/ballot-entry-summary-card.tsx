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

type SplitRecord = { wins: number; losses: number; points: number }

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
			: { tone: "pending", label: isOpen ? "Open" : "Locked" }

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
							<SplitRow label="Official" record={splits.official} />
							<SplitRow label="Community" record={splits.community} />
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

// One half of a game entry's record: the label, then its record and points,
// or that nothing in it has settled yet.
function SplitRow({ label, record }: { label: string; record: SplitRecord }) {
	const settled = record.wins + record.losses > 0
	return (
		<HStack justify="space-between" alignItems="center" gap="3">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.muted",
				})}
			>
				{label}
			</span>
			{settled ? (
				<HStack gap="3" alignItems="baseline">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							color: "fg.default",
						})}
					>
						{formatRecord(record.wins, record.losses)}
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
							color: record.points >= 0 ? "success.default" : "danger.default",
						})}
					>
						{formatSignedPoints(record.points)}
					</span>
				</HStack>
			) : (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					Awaiting results
				</span>
			)}
		</HStack>
	)
}
