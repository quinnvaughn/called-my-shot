import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { SectionLabel } from "#/components/ui/section-label"
import type { WatchBoardRow_RowFragment } from "#/graphql/generated/graphql"
import { useMe } from "#/hooks/use-me"
import { pluralize } from "#/lib/pluralize"
import { WatchBoardRow } from "./watch-board-row"

// Everyone who's finished a quiz on an account, most right first, then
// fastest. Public, so it's the board a subreddit or a Discord looks at.
export function WatchBoard({
	rows,
	total,
	playerCount,
}: {
	rows: WatchBoardRow_RowFragment[]
	total: number
	playerCount: number
}) {
	const me = useMe()
	return (
		<VStack gap="3" alignItems="stretch">
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					gap: "3",
				})}
			>
				<SectionLabel>Board</SectionLabel>
				{playerCount > 0 && (
					<span className={css({ textStyle: "label", color: "fg.muted" })}>
						{playerCount} {pluralize(playerCount, "player")}
					</span>
				)}
			</div>
			{rows.length === 0 ? (
				<EmptyState>Nobody's finished this one yet. Be the first.</EmptyState>
			) : (
				<Card>
					{rows.map((row) => (
						<WatchBoardRow
							key={row.user.id}
							row={row}
							total={total}
							isViewer={row.user.id === me?.id}
						/>
					))}
				</Card>
			)}
		</VStack>
	)
}
