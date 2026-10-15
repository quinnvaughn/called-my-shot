import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { UpdateEditor } from "#/components/admin/update-editor"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { adminUpdateQuery } from "#/graphql/updates/queries"

export const Route = createFileRoute("/admin/updates/$updateId")({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(adminUpdateQuery(params.updateId)),
})

function RouteComponent() {
	const { updateId } = Route.useParams()
	const { data } = useSuspenseQuery(adminUpdateQuery(updateId))
	const result = data.adminUpdate
	const update =
		result.__typename === "QueryAdminUpdateSuccess" ? result.data : null

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title={update?.title || "Update"} />
			{update ? (
				// Keyed so moving between updates starts the form fresh rather than
				// carrying one post's unsaved text into another.
				<UpdateEditor key={update.id} update={update} />
			) : (
				<EmptyState>
					{"message" in result ? result.message : "That update doesn't exist."}
				</EmptyState>
			)}
		</VStack>
	)
}
