import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/admin/data/$leagueId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/admin/data/$leagueId/teams",
			params: { leagueId: params.leagueId },
		})
	},
})
