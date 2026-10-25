import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { EveryWeekRow } from "./every-week-row"
import { EveryWeekTile } from "./every-week-tile"

// A made-up group's week, laid out the way a group shows it: the recap, a
// presser, both boards, the record book, and a challenge.
export function EveryWeekVisual() {
	return (
		<Card>
			<Card.Body>
				<div
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
						gap: "3",
					})}
				>
					<EveryWeekTile eyebrow="This week's recap">
						<VStack gap="0" alignItems="stretch">
							<EveryWeekRow label="Player of the Week" value="@priya" />
							<EveryWeekRow label="Sweep" value="@sam" />
							<EveryWeekRow label="Worst miss" value="@dave" miss />
						</VStack>
					</EveryWeekTile>
					<EveryWeekTile eyebrow="Post-game presser">
						<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
							@priya asks @dave
						</span>
						<p className={css({ fontSize: "sm", lineHeight: "snug" })}>
							95 on the Jets. Walk us through it.
						</p>
						<p
							className={css({
								fontSize: "sm",
								fontStyle: "italic",
								color: "fg.muted",
								borderLeft: "2px solid {colors.border.emphasized}",
								paddingLeft: "2.5",
							})}
						>
							No comment.
						</p>
					</EveryWeekTile>
					<EveryWeekTile eyebrow="Calls leaderboard">
						<VStack gap="0" alignItems="stretch">
							<EveryWeekRow label="1  @mike" value="2,140" />
							<EveryWeekRow label="2  @priya" value="1,875" />
							<EveryWeekRow label="9  @dave" value="212" />
						</VStack>
					</EveryWeekTile>
					<EveryWeekTile eyebrow="Arcade this week">
						<VStack gap="0" alignItems="stretch">
							<EveryWeekRow label="1  @priya" value="52 pts" />
							<EveryWeekRow label="2  @mike" value="47 pts" />
							<EveryWeekRow label="9  @dave" value="19 pts" />
						</VStack>
					</EveryWeekTile>
					<EveryWeekTile eyebrow="Record book">
						<VStack gap="0" alignItems="stretch">
							<EveryWeekRow label="Most points in a week" value="@mike · 612" />
							<EveryWeekRow label="Longest hot streak" value="@sam · 9" />
							<EveryWeekRow label="Most Player of the Week" value="@mike · 3" />
						</VStack>
					</EveryWeekTile>
					<EveryWeekTile eyebrow="Challenge · 3 questions">
						<VStack gap="0" alignItems="stretch">
							<EveryWeekRow label="@sam" value="140 pts" />
							<EveryWeekRow label="@dave" value="95 pts" />
						</VStack>
					</EveryWeekTile>
				</div>
			</Card.Body>
		</Card>
	)
}
