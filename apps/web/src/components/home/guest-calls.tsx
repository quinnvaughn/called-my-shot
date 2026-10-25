import { useSuspenseQuery } from "@tanstack/react-query"
import { guestPicksQuery } from "#/graphql/guest-picks/queries"
import { GuestPicks } from "./guest-picks/guest-picks"

// The calling side of a signed-out Home: a real game to call before there's
// an account, where a signed-in Home has its calls strip.
export function GuestCalls() {
	const { data } = useSuspenseQuery(guestPicksQuery)
	return <GuestPicks questions={data.guestPicks} />
}
