import { createFileRoute, redirect } from "@tanstack/react-router"

// Home moved to "/". Kept for links already out there: old update posts,
// bookmarks, emails.
export const Route = createFileRoute("/home")({
	beforeLoad: () => {
		throw redirect({ to: "/", replace: true })
	},
})
