import { createFileRoute, redirect } from "@tanstack/react-router"

// The Community tab's old address. Its questions now live by subject: ones on
// a game on that game's page, season ones on the Season tab, awards on the
// Ballots tab. Kept so shared links and already-indexed urls still land
// somewhere.
export const Route = createFileRoute("/_app/leagues/$leagueSlug/community")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueSlug/games",
			params: { leagueSlug: params.leagueSlug },
		})
	},
})
