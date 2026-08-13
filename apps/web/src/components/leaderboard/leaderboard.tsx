import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Table, type TableColumn } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"

type LeaderboardColumnKey = "rank" | "member" | "points" | "calls" | "accuracy"

const ALL_COLUMNS: TableColumn<LeaderboardColumnKey>[] = [
	{ key: "rank", label: "#", numeric: true, width: "56px" },
	{ key: "member", label: "Member" },
	{ key: "points", label: "Points", numeric: true, width: "120px" },
	{ key: "calls", label: "Calls", numeric: true, width: "80px" },
	{ key: "accuracy", label: "Accuracy", numeric: true, width: "100px" },
]

export type LeaderboardRowData = {
	rank: number
	totalPoints: number
	callCount: number
	accuracy: number | null
	// group-only - absent (and never rendered) on the site-wide leaderboard
	role?: "ADMIN" | "MEMBER"
	user: { id: string; name: string; username: string }
}

type LeaderboardProps = {
	items: LeaderboardRowData[]
	viewerId?: string
	// the viewer's own row, pinned above the table regardless of whether it
	// falls on the current page - null/undefined (signed out, or the viewer
	// has no entry yet) simply renders nothing
	viewerEntry?: LeaderboardRowData | null
	// group leaderboards don't show an accuracy column today; the site-wide
	// one does - shared component supports both rather than forking it
	showAccuracy?: boolean
	hasMore?: boolean
	loading?: boolean
	onLoadMore?: () => void
	emptyMessage?: string
}

export function Leaderboard({
	items,
	viewerId,
	viewerEntry,
	showAccuracy = false,
	hasMore = false,
	loading = false,
	onLoadMore,
	emptyMessage = "No calls yet.",
}: LeaderboardProps) {
	return (
		<VStack alignItems="stretch" gap="3">
			{viewerEntry && (
				<Card size="sm" variant="surface">
					<Card.Body>
						<HStack gap="3.5" alignItems="center">
							<Avatar size="md" name={viewerEntry.user.name} />
							<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
								<Eyebrow variant="neutral">Your rank</Eyebrow>
								<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
									{viewerEntry.user.name}
								</span>
							</VStack>
							<VStack gap="0.5" alignItems="flex-end" flexShrink="0">
								<span
									className={css({
										fontFamily: "heading",
										fontSize: "xl",
										color: "primary.default",
										lineHeight: "1",
									})}
								>
									#{viewerEntry.rank}
								</span>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "xs",
										color: "fg.muted",
									})}
								>
									{viewerEntry.totalPoints} pts · {viewerEntry.callCount} calls
									{showAccuracy &&
										viewerEntry.accuracy !== null &&
										` · ${Math.round(viewerEntry.accuracy)}%`}
								</span>
							</VStack>
						</HStack>
					</Card.Body>
				</Card>
			)}
			{items.length === 0 && !loading ? (
				<EmptyState>{emptyMessage}</EmptyState>
			) : (
				<Table sortBy="rank" sortDir="desc">
					<Table.Head
						columns={
							showAccuracy
								? ALL_COLUMNS
								: ALL_COLUMNS.filter((c) => c.key !== "accuracy")
						}
					/>
					<Table.Body>
						{items.map((item) => (
							<LeaderboardRow
								key={item.user.id}
								item={item}
								viewerId={viewerId}
								showAccuracy={showAccuracy}
							/>
						))}
					</Table.Body>
				</Table>
			)}
			{hasMore && (
				<Button variant="outline" size="sm" loading={loading} onClick={onLoadMore}>
					Show more →
				</Button>
			)}
		</VStack>
	)
}

function LeaderboardRow({
	item,
	viewerId,
	showAccuracy,
}: {
	item: LeaderboardRowData
	viewerId?: string
	showAccuracy: boolean
}) {
	const isTop3 = item.rank <= 3
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
				<HStack gap="3">
					<Avatar size="sm" name={item.user.name} />
					<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
						{item.user.name} (@{item.user.username})
					</span>
					{item.user.id === viewerId && <Tag>You</Tag>}
					{item.role === "ADMIN" && <Tag variant="primary">Admin</Tag>}
				</HStack>
			</Table.Cell>
			<Table.Cell numeric className={css({ fontFamily: "mono", fontSize: "sm" })}>
				{item.totalPoints}
			</Table.Cell>
			<Table.Cell numeric className={css({ fontFamily: "mono", fontSize: "sm" })}>
				{item.callCount}
			</Table.Cell>
			{showAccuracy && (
				<Table.Cell
					numeric
					className={css({ fontFamily: "mono", fontSize: "sm" })}
				>
					{item.accuracy !== null ? `${Math.round(item.accuracy)}%` : "—"}
				</Table.Cell>
			)}
		</Table.Row>
	)
}
