import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/leagues/$leagueSlug/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueSlug/games",
			params: { leagueSlug: params.leagueSlug },
		})
	},
})
