import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Flair } from "#/components/ui/flair"
import { crownLabel } from "#/lib/leaderboard"
import type { LeaderboardRowData } from "./leaderboard"

// One person's standing as a single card: identity, rank, and the stat line
// the board's columns would otherwise carry. Pinned above the board for the
// viewer, and on its own wherever a person's record needs showing without the
// table around it.
export function LeaderboardEntryCard({
	entry,
	eyebrow,
	unrankedLabel = "Needs a resolved call",
}: {
	entry: LeaderboardRowData
	eyebrow: string
	// What the stat line says while rank is null
	unrankedLabel?: string
}) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<VStack alignItems="stretch" gap="2">
					{/* Only the rank shares the identity's row, and only because
					it is two characters. The stat line gets the row below, full
					width - beside the name it was the one thing long enough to
					break it across lines on a phone. */}
					<HStack gap="3.5" alignItems="flex-start">
						<Avatar
							size="md"
							name={entry.user.name}
							src={entry.user.avatarUrl}
							crown={crownLabel(entry)}
						/>
						<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
							<Eyebrow variant="neutral">{eyebrow}</Eyebrow>
							<span
								className={css({
									fontSize: "sm",
									fontWeight: "semibold",
								})}
							>
								{entry.user.name}
							</span>
							{entry.user.flair && <Flair flair={entry.user.flair} />}
						</VStack>
						{/* Informational, not something to tap, so never the
						primary orange. */}
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "xl",
								color: entry.rank !== null ? "secondary.default" : "fg.muted",
								lineHeight: "1",
								flexShrink: "0",
							})}
						>
							{entry.rank !== null ? `#${entry.rank}` : "N/A"}
						</span>
					</HStack>
					<span
						className={css({
							textStyle: "metaLg",
							color: "fg.muted",
							textAlign: "right",
						})}
					>
						{entry.rank !== null ? (
							<>
								{entry.totalPoints} pts · {entry.resolvedCallCount} resolved
								{entry.accuracy !== null && ` · ${Math.round(entry.accuracy)}%`}
							</>
						) : (
							unrankedLabel
						)}
					</span>
				</VStack>
			</Card.Body>
		</Card>
	)
}
