import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import type { SeasonSquare } from "#/components/arcade/name-that-season/season-result"
import { Avatar } from "#/components/ui/avatar"

// A groupmate on one of the demo's arcade boards: who, their squares, and how
// it went. The viewer's row is tinted blue: it marks where they stand, it
// isn't something to tap.
export function GroupDayMemberRow({
	name,
	isYou,
	squares,
	result,
}: {
	name: string
	isYou: boolean
	squares: SeasonSquare[]
	result: string
}) {
	return (
		<HStack
			gap="2.5"
			className={css({
				paddingBlock: "1.5",
				paddingInline: "2",
				borderRadius: "sm",
				backgroundColor: isYou ? "secondary.default/10" : "transparent",
			})}
		>
			<Avatar name={name} size="xs" />
			<span
				className={css({
					flex: 1,
					minWidth: 0,
					fontSize: "sm",
					fontWeight: "medium",
					truncate: true,
				})}
			>
				{name}
			</span>
			<GuessSquares size="sm" squares={squares} />
			<span
				className={css({
					textStyle: "meta",
					color: "fg.muted",
					width: "16",
					textAlign: "right",
					flexShrink: 0,
				})}
			>
				{result}
			</span>
		</HStack>
	)
}
