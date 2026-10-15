import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { SignedPoints } from "#/components/ui/signed-points"
import { formatRecord } from "#/lib/game-status"

export type SplitRecord = { wins: number; losses: number; points: number }

// One half of a game entry's record: the label, then its record and points,
// or that nothing in it has settled yet.
export function BallotEntrySplitRow({
	label,
	record,
}: {
	label: string
	record: SplitRecord
}) {
	const settled = record.wins + record.losses > 0
	return (
		<HStack justify="space-between" alignItems="center" gap="3">
			<span
				className={css({
					textStyle: "label",
					color: "fg.muted",
				})}
			>
				{label}
			</span>
			{settled ? (
				<HStack gap="3" alignItems="baseline">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							color: "fg.default",
						})}
					>
						{formatRecord(record.wins, record.losses)}
					</span>
					<SignedPoints
						value={record.points}
						zeroSign
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
						})}
					/>
				</HStack>
			) : (
				<span
					className={css({
						textStyle: "metaLg",
						color: "fg.subtle",
					})}
				>
					Awaiting results
				</span>
			)}
		</HStack>
	)
}
