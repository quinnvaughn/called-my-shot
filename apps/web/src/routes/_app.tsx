import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "#/components/app-shell/app-shell"

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	)
}
