import { createFileRoute, redirect } from "@tanstack/react-router"

// The Community tab's oldest address - see community.tsx.
export const Route = createFileRoute("/_app/leagues/$leagueSlug/feed")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueSlug/games",
			params: { leagueSlug: params.leagueSlug },
		})
	},
})
