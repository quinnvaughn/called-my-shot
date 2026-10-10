import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Flair, type FlairData } from "#/components/ui/flair"
import { Table, type TableColumn } from "#/components/ui/table"

type LeaderboardColumnKey =
	| "rank"
	| "member"
	| "points"
	| "resolved"
	| "accuracy"

const COLUMNS: TableColumn<LeaderboardColumnKey>[] = [
	{ key: "rank", label: "#", numeric: true, width: "56px" },
	{ key: "member", label: "Member" },
	{ key: "points", label: "Points", numeric: true, width: "120px" },
	{ key: "resolved", label: "Resolved", numeric: true, width: "90px" },
	{ key: "accuracy", label: "Accuracy", numeric: true, width: "100px" },
]

export type LeaderboardRowData = {
	// null until a resolved call - only ever the viewer's own pinned entry,
	// since the board itself lists ranked rows only
	rank: number | null
	totalPoints: number
	// settled calls only - a pending call has no result to stand on, so the
	// board never counts it (accuracy and the ranking tiebreak agree)
	resolvedCallCount: number
	accuracy: number | null
	// The week this member was named Player of the Week, while they still
	// hold it ("Oct 6 to 12"). Group boards only.
	playerOfTheWeek?: string | null
	user: {
		id: string
		name: string
		username: string
		avatarUrl?: string | null
		flair?: FlairData | null
	}
}

type LeaderboardProps = {
	items: LeaderboardRowData[]
	viewerId?: string
	// the viewer's own row, pinned above the table regardless of whether it
	// falls on the current page - null/undefined (signed out, or the viewer
	// has no entry yet) simply renders nothing
	viewerEntry?: LeaderboardRowData | null
	hasMore?: boolean
	loading?: boolean
	onLoadMore?: () => void
	emptyMessage?: string
	// What the viewer's card says while they're unranked. Defaults to
	// LeaderboardEntryCard's own.
	viewerUnrankedLabel?: string
}

const crownLabel = (entry: LeaderboardRowData) =>
	entry.playerOfTheWeek ? `Player of the Week, ${entry.playerOfTheWeek}` : null

export function Leaderboard({
	items,
	viewerId,
	viewerEntry,
	viewerUnrankedLabel,
	hasMore = false,
	loading = false,
	onLoadMore,
	emptyMessage = "No calls yet.",
}: LeaderboardProps) {
	return (
		<VStack alignItems="stretch" gap="3">
			{viewerEntry && (
				<LeaderboardEntryCard
					entry={viewerEntry}
					eyebrow="Your rank"
					unrankedLabel={viewerUnrankedLabel}
				/>
			)}
			{items.length === 0 && !loading ? (
				<EmptyState>{emptyMessage}</EmptyState>
			) : (
				<Table sortBy="rank" sortDir="desc">
					<Table.Head columns={COLUMNS} />
					<Table.Body>
						{items.map((item) => (
							<LeaderboardRow
								key={item.user.id}
								item={item}
								viewerId={viewerId}
							/>
						))}
					</Table.Body>
				</Table>
			)}
			{hasMore && (
				<Button
					variant="outline"
					size="sm"
					loading={loading}
					onClick={onLoadMore}
				>
					Show more →
				</Button>
			)}
		</VStack>
	)
}

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
							fontFamily: "mono",
							fontSize: "xs",
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

function LeaderboardRow({
	item,
	viewerId,
}: {
	item: LeaderboardRowData
	viewerId?: string
}) {
	const isTop3 = item.rank !== null && item.rank <= 3
	return (
		<Table.Row active={item.user.id === viewerId}>
			<Table.Cell
				numeric
				className={css({
					color: isTop3 ? "primary.default" : "fg.subtle",
					fontWeight: isTop3 ? "bold" : "inherit",
					fontSize: "sm",
					fontFamily: "mono",
				})}
			>
				{item.rank}
			</Table.Cell>
			<Table.Cell>
				{/* Name and handle share the top line; the flair gets the second to
				itself. No "you" tag - the row is already highlighted for the viewer
				(Table.Row active, below), so the tag repeated what the row said and
				took width from the two things that name the person. */}
				<HStack gap="3" minWidth="0">
					<Avatar
						size="sm"
						name={item.user.name}
						src={item.user.avatarUrl}
						crown={crownLabel(item)}
					/>
					<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
						<HStack gap="2" minWidth="0" maxWidth="full">
							<Link
								to={"/user/$username"}
								params={{ username: item.user.username }}
								className={css({
									minWidth: "0",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									fontSize: "sm",
									fontWeight: "medium",
									_hover: { textDecoration: "underline" },
								})}
							>
								{item.user.name}
							</Link>
							<span
								className={css({
									minWidth: "0",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.muted",
								})}
							>
								@{item.user.username}
							</span>
						</HStack>
						{item.user.flair && <Flair flair={item.user.flair} />}
					</VStack>
				</HStack>
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.totalPoints}
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.resolvedCallCount}
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.accuracy !== null ? `${Math.round(item.accuracy)}%` : "-"}
			</Table.Cell>
		</Table.Row>
	)
}
