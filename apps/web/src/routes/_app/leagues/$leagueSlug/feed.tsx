import { createFileRoute, redirect } from "@tanstack/react-router"

// The Community tab's old address, kept so shared links and already-indexed
// urls still land on it.
export const Route = createFileRoute("/_app/leagues/$leagueSlug/feed")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueSlug/community",
			params: { leagueSlug: params.leagueSlug },
		})
	},
})
