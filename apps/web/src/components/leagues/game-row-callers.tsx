import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AvatarStack } from "#/components/ui/avatar-stack"

// Below this, an everyone count reads as an empty room rather than a reason
// to tap in.
const MIN_CALLERS_SHOWN = 3

type Caller = { id: string; name: string; avatarUrl?: string | null }

type Props = {
	callerCount: number
	groupCallers: { count: number; preview: Caller[] }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

// "Sam and Jordan", or "Sam, Jordan and 3 more" when the count runs past the
// names shown.
function groupCallersLabel({ count, preview }: Props["groupCallers"]): string {
	const names = preview.slice(0, 2).map((c) => firstName(c.name))
	const rest = count - names.length
	if (rest > 0) return `${names.join(", ")} and ${rest} more`
	return names.join(" and ")
}

// Who else is in on a game, under its row on the league Games tab. People
// from the viewer's groups when any of them called it, otherwise a plain
// count of everyone once it's big enough to mean something.
export function GameRowCallers({ callerCount, groupCallers }: Props) {
	if (groupCallers.count > 0) {
		return (
			<HStack gap="2" alignItems="center">
				<AvatarStack members={groupCallers.preview} max={3} />
				<span
					className={css({ textStyle: "meta", color: "secondary.default" })}
				>
					{groupCallersLabel(groupCallers)} from your groups called this game
				</span>
			</HStack>
		)
	}
	if (callerCount < MIN_CALLERS_SHOWN) return null
	return (
		<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
			{callerCount} players called this game
		</span>
	)
}
