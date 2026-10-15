import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { SignedPoints } from "#/components/ui/signed-points"
import { formatRecord } from "#/lib/game-status"
import type { TrackRecordSide } from "#/lib/stat-context"

export function TrackRecordRow(props: {
	label: string
	sides: TrackRecordSide[]
}) {
	return (
		<HStack justify="space-between" alignItems="baseline" gap="3">
			<span className={css({ fontSize: "sm", color: "fg.muted" })}>
				{props.label}
			</span>
			<HStack gap="4" alignItems="baseline">
				{props.sides.map((side) => (
					<span
						key={side.label}
						className={css({ fontFamily: "mono", fontSize: "sm" })}
					>
						{side.label} {formatRecord(side.wins, side.losses)}{" "}
						<SignedPoints value={side.netPoints} zeroSign />
					</span>
				))}
			</HStack>
		</HStack>
	)
}
