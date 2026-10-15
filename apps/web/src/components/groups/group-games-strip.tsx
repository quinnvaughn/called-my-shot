import { useSuspenseQuery } from "@tanstack/react-query"
import { useState } from "react"
import { HStack } from "styled-system/jsx"
import { CardRail } from "#/components/ui/card-rail"
import { ChipButton } from "#/components/ui/chip-button"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"
import { GameTile } from "./game-tile"

export const GroupLiveGamesDocument = graphql(`
	query GroupLiveGames($groupId: ID!) {
		group(id: $groupId) {
			id
			liveGames {
				game {
					id
					status
					startsAt
					league {
						id
						abbreviation
					}
				}
				...GroupGamesStrip_game
			}
		}
	}
`)

// Seeded from GroupHome by the Home tab's loader, so the strip costs no
// request of its own on load. Re-read on its own while a listed game is on,
// so the scores move without refetching the rest of the page.
export const groupLiveGamesQuery = (groupId: string) =>
	gqlQueryOptions(
		GroupLiveGamesDocument,
		{ groupId },
		{
			refetchInterval: (query) =>
				query.state.data?.group?.liveGames.some((g) => isGameInPlay(g.game))
					? IN_PLAY_REFETCH_MS
					: false,
		},
	)

// Games the group has calls on that are on now, start within a day, or just
// ended, each leading to the group's board for that game. Renders nothing
// when there aren't any.
//
// League chips narrow it once it spans two or more leagues. All stays the
// default so a live game is never hidden behind a pick, and the filter is
// client-side: the window is small and the chips need every game's league
// anyway.
export function GroupGamesStrip({ groupId }: { groupId: string }) {
	const { data } = useSuspenseQuery(groupLiveGamesQuery(groupId))
	const [leagueId, setLeagueId] = useState<string | null>(null)
	const games = data.group?.liveGames ?? []
	if (games.length === 0) return null

	const leagues = [
		...new Map(games.map((g) => [g.game.league.id, g.game.league])).values(),
	]
	// A league whose last game aged out of the window since it was picked
	// falls back to All rather than leaving an empty row.
	const activeLeagueId = leagues.some((l) => l.id === leagueId)
		? leagueId
		: null
	const shown = activeLeagueId
		? games.filter((g) => g.game.league.id === activeLeagueId)
		: games

	return (
		<CardRail
			items={shown}
			getKey={(g) => g.game.id}
			itemLabel="game"
			title="Games"
			header={
				leagues.length > 1 && (
					<HStack gap="1.5" flexWrap="wrap">
						<ChipButton
							selected={activeLeagueId === null}
							pressed={activeLeagueId === null}
							onClick={() => setLeagueId(null)}
						>
							All
						</ChipButton>
						{leagues.map((league) => (
							<ChipButton
								key={league.id}
								selected={activeLeagueId === league.id}
								pressed={activeLeagueId === league.id}
								onClick={() => setLeagueId(league.id)}
							>
								{league.abbreviation}
							</ChipButton>
						))}
					</HStack>
				)
			}
			renderItem={(g) => <GameTile groupId={groupId} game={g} />}
		/>
	)
}
