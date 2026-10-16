import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { OptionRow } from "#/components/questions/option-row"
import { AvatarStack } from "#/components/ui/avatar-stack"

type Props = {
	label: string
	fieldPct: number
	// The groupmates on this side, the viewer included once they've picked it.
	groupmates: string[]
	picked: boolean
	final: number | null
}

// One side of the demo's question: the app's option row, colored the way the
// call form colors a pick, and under it who in the group is on it.
export function DemoSide({
	label,
	fieldPct,
	groupmates,
	picked,
	final,
}: Props) {
	return (
		<VStack gap="2" alignItems="stretch">
			<OptionRow
				label={final === null ? label : `${label} · ${final}`}
				fieldPct={fieldPct}
				selected={picked}
			/>
			<HStack gap="2">
				<AvatarStack
					members={groupmates.map((name) => ({ id: name, name }))}
					max={4}
				/>
				<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
					{groupmates.length} in your group
				</span>
			</HStack>
		</VStack>
	)
}
