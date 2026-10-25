import { useSuspenseQuery } from "@tanstack/react-query"
import { LeagueRoomCard } from "#/components/home/league-room-card"
import { CardRail } from "#/components/ui/card-rail"
import { SectionLabel } from "#/components/ui/section-label"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { orderLeaguesByActivity } from "#/lib/league-order"

// The viewer's own Calls tab only: each league's open calls, games in the
// window and next lock, busiest league first. The profile route loads the
// dashboard query for its owner before this renders.
export function ProfileLeagueRooms() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const leagues = orderLeaguesByActivity(data.leagues)
	return (
		<CardRail
			items={leagues}
			getKey={(league) => league.id}
			renderItem={(league) => <LeagueRoomCard league={league} />}
			itemLabel="league"
			header={<SectionLabel>Leagues</SectionLabel>}
		/>
	)
}
