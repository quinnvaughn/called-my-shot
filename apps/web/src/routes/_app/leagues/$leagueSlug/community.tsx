import { createFileRoute, redirect } from "@tanstack/react-router"

// The Community tab's old address. Kept so shared links and already-indexed
// urls still land somewhere: the league's Feed, where people post now.
export const Route = createFileRoute("/_app/leagues/$leagueSlug/community")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueSlug/feed",
			params: { leagueSlug: params.leagueSlug },
		})
	},
})
