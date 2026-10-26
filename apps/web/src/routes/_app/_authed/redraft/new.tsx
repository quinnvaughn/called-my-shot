import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { RedraftComposer } from "#/components/posts/redraft-composer/redraft-composer"
import { PageHeader } from "#/components/ui/page-header"

export const Route = createFileRoute("/_app/_authed/redraft/new")({
	component: RouteComponent,
	// prompt: redraft that class (a class page's Make yours). group: post it
	// to that group (a group's Posts tab).
	validateSearch: z.object({
		prompt: z.string().optional().catch(undefined),
		group: z.string().optional().catch(undefined),
	}),
})

function RouteComponent() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()

	return (
		// Room under the form, so the last field isn't pinned to the bottom of
		// the window.
		<VStack gap="6" alignItems="stretch" paddingBottom="24">
			<PageHeader
				title="Make a redraft"
				subtitle="Pick a real draft class over again, knowing how every career turned out."
			/>
			<RedraftComposer
				classCode={search.prompt ?? null}
				presetGroupId={search.group ?? null}
				onClassChange={(code) =>
					void navigate({
						search: (prev) => ({ ...prev, prompt: code ?? undefined }),
					})
				}
			/>
		</VStack>
	)
}
