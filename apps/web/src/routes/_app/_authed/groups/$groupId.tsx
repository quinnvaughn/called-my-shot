import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Tabs } from "#/components/ui/tabs"

export const Route = createFileRoute("/_app/_authed/groups/$groupId")({
	component: RouteComponent,
})

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<"answered" | "created" | "shared">(
		"answered",
	)
	return (
		<div>
			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<Tabs.List>
					<Tabs.Trigger value="answered">Answered</Tabs.Trigger>
					<Tabs.Trigger value="created">Created</Tabs.Trigger>
					<Tabs.Trigger value="shared">Shared</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
		</div>
	)
}
