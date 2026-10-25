import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { RushmoreComposer } from "#/components/posts/rushmore-composer/rushmore-composer"
import { PageHeader } from "#/components/ui/page-header"

export const Route = createFileRoute("/_app/_authed/rushmore/new")({
	component: RouteComponent,
	// prompt: answer that prompt (a team space's or prompt page's Make
	// yours). group: post it to that group (a group's Posts tab).
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
				title="Make a Mount Rushmore"
				subtitle="Four players, and a few words if you want."
			/>
			<RushmoreComposer
				promptCode={search.prompt ?? null}
				presetGroupId={search.group ?? null}
				onPromptChange={(code) =>
					void navigate({
						search: (prev) => ({ ...prev, prompt: code ?? undefined }),
					})
				}
			/>
		</VStack>
	)
}
