import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import type { FlairData } from "#/components/ui/flair"
import { Table, type TableColumn } from "#/components/ui/table"
import { LeaderboardEntryCard } from "./leaderboard-entry-card"
import { LeaderboardRow } from "./leaderboard-row"

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
