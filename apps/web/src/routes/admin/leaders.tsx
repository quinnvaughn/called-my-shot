import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
	leaderLossSettingConfig,
	leaderLossSettingRows,
} from "#/components/admin/loss-settings"
import { LossSettingsPage } from "#/components/admin/loss-settings-page"
import { adminLeaderLossSettingsQuery } from "#/graphql/admin/calibration/queries"

export const Route = createFileRoute("/admin/leaders")({
	component: RouteComponent,
	loader: ({ context }) =>
		context.queryClient.query(adminLeaderLossSettingsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminLeaderLossSettingsQuery)
	return (
		<LossSettingsPage
			config={leaderLossSettingConfig}
			rows={leaderLossSettingRows(data)}
		/>
	)
}
