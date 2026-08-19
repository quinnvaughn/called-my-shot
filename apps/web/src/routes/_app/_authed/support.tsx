import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { SupportForm } from "#/components/support/support-form"
import { PageHeader } from "#/components/ui/page-header"

export const Route = createFileRoute("/_app/_authed/support")({
	component: RouteComponent,
})

function RouteComponent() {
	const { me } = useRouteContext({ from: "__root__" })
	// _authed's beforeLoad already redirects guests to "/" before this ever
	// renders - me is only null for an instant during that redirect.
	if (!me) return null

	return (
		<VStack alignItems="stretch" gap="8" maxWidth="xl">
			<PageHeader
				title="Support"
				subtitle="Report a bug, ask a question, or send feedback"
			/>
			<SupportForm />
		</VStack>
	)
}
