import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/_authed")({
	beforeLoad: ({ context }) => {
		if (!context.me) {
			throw redirect({ to: "/" })
		}
	},
})
