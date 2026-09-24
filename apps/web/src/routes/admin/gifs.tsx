import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { AdminGifHealthDocument } from "#/graphql/queries/gifs"
import { gqlQueryOptions } from "#/graphql/query-options"

export const Route = createFileRoute("/admin/gifs")({
	component: RouteComponent,
})

const columns = [
	{ key: "state", label: "State", sortable: false },
	{ key: "alt", label: "Gif", sortable: false },
	{ key: "status", label: "Status", sortable: false },
	{ key: "url", label: "URL", sortable: false },
] as const

// The reaction gifs on /calls/:id are hotlinked from cdns we don't control, so
// a dead one shows up nowhere: the call page just renders no gif. This is the
// only place that says so. Every url is fetched when the page loads rather
// than read from a table a job fills - see lib/gif-health.ts in the API for
// why - so expect it to take a few seconds.
function RouteComponent() {
	const { data, isFetching } = useQuery(
		gqlQueryOptions(AdminGifHealthDocument, {}),
	)
	const report =
		data?.adminGifHealth.__typename === "QueryAdminGifHealthSuccess"
			? data.adminGifHealth.data
			: null

	const rows = report?.rows ?? []
	const emptyStates = report?.emptyStates ?? []
	const brokenCount = rows.filter((r) => !r.ok).length

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Gifs"
				subtitle="Every reaction gif a call can show, checked live against its host."
			/>

			<HStack gap="4" alignItems="baseline">
				<span className={css({ fontFamily: "mono", fontSize: "sm" })}>
					{isFetching && rows.length === 0
						? "Checking…"
						: `${brokenCount} of ${rows.length} broken`}
				</span>
				{/* A pool with nothing in it can't appear in the table below -
				there is no url to check - but that state's calls render no gif
				at all, which is the same outcome as every url in it being
				dead. */}
				{emptyStates.length > 0 && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							color: "danger.default",
						})}
					>
						Empty pools: {emptyStates.join(", ")}
					</span>
				)}
			</HStack>

			{rows.length === 0 && !isFetching ? (
				<EmptyState>
					Every pool is empty, so no call is showing a reaction right now.
				</EmptyState>
			) : (
				<Table sortBy="state" sortDir="asc" wide>
					<Table.Head columns={[...columns]} />
					<Table.Body>
						{rows.map((row) => (
							<Table.Row key={row.url}>
								<Table.Cell>{row.state}</Table.Cell>
								<Table.Cell>{row.alt}</Table.Cell>
								<Table.Cell>
									<span
										className={
											row.ok ? undefined : css({ color: "danger.default" })
										}
									>
										{/* A null status means nothing answered at all -
										a timeout or a refused connection - which is a
										different problem from the host saying the gif
										is gone. */}
										{row.status ?? (row.error ? "No response" : "—")}
									</span>
								</Table.Cell>
								<Table.Cell>
									<a
										href={row.url}
										target="_blank"
										rel="noreferrer"
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.subtle",
											_hover: { color: "fg.default" },
										})}
									>
										{row.url}
									</a>
								</Table.Cell>
							</Table.Row>
						))}
					</Table.Body>
				</Table>
			)}
		</VStack>
	)
}
