import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
	titleLossSettingConfig,
	titleLossSettingRows,
} from "#/components/admin/loss-settings"
import { LossSettingsPage } from "#/components/admin/loss-settings-page"
import { adminTitleLossSettingsQuery } from "#/graphql/admin/calibration/queries"

export const Route = createFileRoute("/admin/titles")({
	component: RouteComponent,
	loader: ({ context }) =>
		context.queryClient.query(adminTitleLossSettingsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminTitleLossSettingsQuery)
	return (
		<LossSettingsPage
			config={titleLossSettingConfig}
			rows={titleLossSettingRows(data)}
		/>
	)
}
