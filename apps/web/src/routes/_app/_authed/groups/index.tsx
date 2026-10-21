import { createFileRoute, redirect } from "@tanstack/react-router"

// The groups list moved into Spaces, alongside the leagues. Kept for links
// shared or bookmarked before then.
export const Route = createFileRoute("/_app/_authed/groups/")({
	beforeLoad: () => {
		throw redirect({ to: "/spaces", statusCode: 301 })
	},
})
