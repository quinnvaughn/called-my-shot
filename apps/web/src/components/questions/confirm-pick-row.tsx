import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	type ImagePlayer,
	type ImageTeam,
	PlayerOrTeamImage,
} from "#/components/ui/player-or-team-image"

// Name is always the highest-contrast text in the row - this is the one
// thing being confirmed, everything else here is supporting detail.
export function ConfirmPickRow({
	name,
	subject = null,
	meta,
	payout,
}: {
	name: string
	// The player or team the pick is, shown beside it.
	subject?: { player?: ImagePlayer | null; team?: ImageTeam | null } | null
	meta: string
	payout:
		| { win: number; lose: number }
		| { winLow: number; winHigh: number; lose: number }
		| null
}) {
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<VStack gap="0.5" alignItems="stretch" className={css({ minWidth: 0 })}>
				<HStack gap="2" alignItems="center" minWidth="0">
					{subject && (
						<PlayerOrTeamImage player={subject.player} team={subject.team} />
					)}
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "bold",
							color: "fg.default",
							truncate: true,
						})}
					>
						{name}
					</span>
				</HStack>
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{meta}
				</span>
			</VStack>
			{payout && (
				<span
					className={css({
						flexShrink: "0",
						textStyle: "metaLg",
						whiteSpace: "nowrap",
					})}
				>
					<span
						className={css({ color: "success.default", fontWeight: "bold" })}
					>
						+
						{"win" in payout
							? payout.win
							: `${payout.winLow}–${payout.winHigh}`}
					</span>
					<span className={css({ color: "fg.subtle" })}> / </span>
					<span
						className={css({ color: "danger.default", fontWeight: "bold" })}
					>
						−{payout.lose}
					</span>
				</span>
			)}
		</HStack>
	)
}
