import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/leagues/$leagueId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/leagues/$leagueId/games",
			params: { leagueId: params.leagueId },
		})
	},
})
