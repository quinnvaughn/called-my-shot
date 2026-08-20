import { useQuery } from "@apollo/client/react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { AdminLeagueDocument } from "#/graphql/queries/admin"

export const Route = createFileRoute("/admin/data/$leagueId")({
	component: RouteComponent,
})

const NAV_ITEMS = [
	{ to: "/admin/data/$leagueId/teams", label: "Teams" },
	{ to: "/admin/data/$leagueId/players", label: "Players" },
	{ to: "/admin/data/$leagueId/games", label: "Games" },
] as const

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { data } = useQuery(AdminLeagueDocument, { variables: { leagueId } })

	return (
		<VStack gap="6" alignItems="stretch">
			<VStack gap="2" alignItems="flex-start">
				<Link
					to="/admin/data"
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
						_hover: { color: "fg.muted" },
					})}
				>
					← Back to Data
				</Link>
				<PageHeader title={data?.league?.name ?? "League"} />
			</VStack>

			<Tabs.List>
				{NAV_ITEMS.map((item) => (
					<Tabs.LinkTrigger key={item.to} to={item.to} params={{ leagueId }}>
						{item.label}
					</Tabs.LinkTrigger>
				))}
			</Tabs.List>

			<Outlet />
		</VStack>
	)
}
