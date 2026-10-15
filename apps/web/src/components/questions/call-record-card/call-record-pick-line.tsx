import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import type { CallRecordCardData } from "./types"

// One pick of a multi-pick award call. A miss is muted like a missed call's
// headline, and a pending pick carries no mark at all.
export function CallRecordPickLine({
	pick,
}: {
	pick: NonNullable<CallRecordCardData["picks"]>[number]
}) {
	return (
		<HStack gap="2.5" alignItems="center">
			<PlayerOrTeamImage player={pick.player} team={pick.team} />
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "xl",
					lineHeight: "1.2",
					color: pick.hit === false ? "fg.muted" : "fg.default",
				})}
			>
				{pick.label}
			</span>
			{pick.hit !== null && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						fontWeight: "medium",
						textTransform: "uppercase",
						letterSpacing: "wider",
						color: pick.hit ? "success.default" : "danger.default",
					})}
				>
					{pick.hit ? "Hit" : "Miss"}
				</span>
			)}
		</HStack>
	)
}
