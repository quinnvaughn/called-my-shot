import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import type { DemoBoardEntry } from "./demo-fixture"

// A row of the demo's group board. The viewer's row is tinted blue: it marks
// where they stand, it isn't something to tap.
export function DemoBoardRow({
	rank,
	entry,
}: {
	rank: number
	entry: DemoBoardEntry
}) {
	return (
		<HStack
			gap="2.5"
			className={css({
				paddingBlock: "1.5",
				paddingInline: "2",
				borderRadius: "sm",
				backgroundColor: entry.isYou ? "secondary.default/10" : "transparent",
			})}
		>
			<span
				className={css({ textStyle: "metaLg", color: "fg.subtle", width: "4" })}
			>
				{rank}
			</span>
			<Avatar name={entry.name} size="xs" />
			<span className={css({ flex: 1, fontSize: "sm", fontWeight: "medium" })}>
				{entry.name}
				{entry.moved > 0 && (
					<span
						className={css({
							textStyle: "meta",
							color: "secondary.default",
							marginLeft: "1.5",
						})}
					>
						▲{entry.moved}
					</span>
				)}
			</span>
			<span className={css({ textStyle: "metaLg" })}>
				{entry.points.toLocaleString()}
			</span>
		</HStack>
	)
}
