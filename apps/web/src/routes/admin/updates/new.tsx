import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { UpdateEditor } from "#/components/admin/update-editor"
import { PageHeader } from "#/components/ui/page-header"

export const Route = createFileRoute("/admin/updates/new")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="New update" subtitle="Saved as a draft." />
			<UpdateEditor update={null} />
		</VStack>
	)
}
