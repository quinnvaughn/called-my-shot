import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { AdminShell } from "#/components/admin/admin-shell"

export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context }) => {
		if (!context.me?.isAdmin) throw redirect({ to: "/" })
	},
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<AdminShell>
			<Outlet />
		</AdminShell>
	)
}
