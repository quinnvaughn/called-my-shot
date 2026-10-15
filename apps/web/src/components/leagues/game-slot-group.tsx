import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameRow } from "#/components/leagues/game-row"
import { SlateSweepLine } from "#/components/leagues/slate-sweep-line"
import type { LeagueGamesForWindowQuery } from "#/graphql/generated/graphql"

type Props = {
	group: NonNullable<
		LeagueGamesForWindowQuery["leagueGamesForWindow"]
	>["groups"][number]
	leagueSlug: string
}

export function GameSlotGroup({ group, leagueSlug }: Props) {
	return (
		<VStack gap="2" alignItems="stretch">
			{group.slotLabel && (
				<HStack gap="2.5" alignItems="center">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.muted",
							whiteSpace: "nowrap",
						})}
					>
						{group.slotLabel}
					</span>
					<span
						className={css({
							flex: 1,
							height: "1px",
							bg: "border.default",
						})}
					/>
				</HStack>
			)}
			{group.viewerSweep && (
				<SlateSweepLine progress={group.viewerSweep} leagueSlug={leagueSlug} />
			)}
			{group.games.map((game) => (
				<GameRow key={game.id} game={game} leagueSlug={leagueSlug} />
			))}
		</VStack>
	)
}
