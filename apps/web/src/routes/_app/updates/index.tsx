import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { updatesQuery } from "#/graphql/updates/queries"
import { formatCallDate } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/updates/")({
	loader: async ({ context }) => {
		await context.queryClient.query(updatesQuery)
	},
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "Updates · Called My Shot",
			description: "New features on Called My Shot, newest first.",
			path: "/updates",
		}),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(updatesQuery)

	return (
		<VStack gap="6" alignItems="stretch" maxWidth="2xl">
			<PageHeader title="Updates" subtitle="New features, newest first." />
			{data.updates.length === 0 ? (
				<EmptyState>Nothing here yet.</EmptyState>
			) : (
				<VStack gap="4" alignItems="stretch">
					{data.updates.map((update) =>
						update.slug ? (
							<Link
								key={update.id}
								to="/updates/$slug"
								params={{ slug: update.slug }}
								className={css({
									display: "flex",
									flexDirection: "column",
									gap: "3",
									padding: "4",
									borderRadius: "xl",
									border: "1px solid {colors.border.default}",
									bg: "bg.surface",
									_hover: { border: "1px solid {colors.border.emphasized}" },
								})}
							>
								{update.coverImageUrl && (
									<img
										src={update.coverImageUrl}
										alt=""
										className={css({
											width: "full",
											aspectRatio: "2 / 1",
											objectFit: "cover",
											borderRadius: "lg",
										})}
									/>
								)}
								{update.publishedAt && (
									<span
										className={css({
											textStyle: "label",
											color: "fg.subtle",
										})}
									>
										{formatCallDate(update.publishedAt)}
									</span>
								)}
								<span
									className={css({
										fontFamily: "heading",
										fontSize: "xl",
										lineHeight: "tight",
									})}
								>
									{update.title}
								</span>
								<span className={css({ fontSize: "sm", color: "fg.muted" })}>
									{update.summary}
								</span>
							</Link>
						) : null,
					)}
				</VStack>
			)}
		</VStack>
	)
}
