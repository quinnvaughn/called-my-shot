import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import type { StatContextCard_StatContextFragment } from "#/graphql/generated/graphql"
import { defenseTiles, round, type TeamLabels } from "#/lib/stat-context"
import { mutedClass, numberClass } from "./styles"
import { TileGrid } from "./tile-grid"

// A pool question's answer is who is in front, so the list is the card. Rank
// on the left, name, then what they average - the number stays right-aligned
// and in the same face as every other figure here so the column scans.
//
// The sample is spelled out per row rather than printed as a bare count: one
// game reads "last game", which is honest about the ordering being a single
// week rather than dressing it up as an average. Early in a season that is
// what every row will say, and saying it is better than implying a season's
// worth of evidence behind the sort.
export function Ranking({
	ranking,
	defenses,
	teams,
}: {
	ranking: StatContextCard_StatContextFragment["ranking"]
	defenses: StatContextCard_StatContextFragment["defenses"]
	teams: TeamLabels
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				{ranking.map((player, index) => {
					// Named on the row because it is not the same down the list:
					// half the pool is facing one of these defenses and half the
					// other, and the tiles below say what each gives up.
					const opponent = player.opponentTeamId
						? teams[player.opponentTeamId]
						: undefined
					return (
						<HStack key={player.playerId} justify="space-between" gap="3">
							<HStack gap="2" minWidth="0">
								<span className={mutedClass}>{index + 1}</span>
								<PlayerHeadshot
									name={player.label}
									src={player.player?.headshotUrl}
								/>
								<span
									className={css({
										fontSize: "sm",
										minWidth: "0",
										truncate: true,
									})}
								>
									{player.label}
								</span>
								{opponent && (
									<span className={cx(mutedClass, css({ flexShrink: "0" }))}>
										{player.isHome ? "vs" : "@"} {opponent}
									</span>
								)}
							</HStack>
							<HStack gap="2" flexShrink="0">
								<span className={numberClass}>{round(player.mean)}</span>
								<span className={mutedClass}>
									{player.games === 1 ? "last game" : `${player.games} games`}
								</span>
							</HStack>
						</HStack>
					)
				})}
			</VStack>
			<TileGrid tiles={defenseTiles(defenses, teams)} dense={false} />
		</VStack>
	)
}
