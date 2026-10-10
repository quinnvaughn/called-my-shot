import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FiFileText } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { NotFound } from "#/components/ui/not-found"
import { UpdateBody } from "#/components/updates/update-body"
import { UpdateDocument } from "#/graphql/queries/updates"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatCallDate } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/updates/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			gqlQueryOptions(UpdateDocument, { slug: params.slug }),
		)
		return { update: data.update ?? null }
	},
	head: ({ loaderData }) => {
		const update = loaderData?.update
		if (!update?.slug) return {}
		return pageMeta({
			title: `${update.title} · Called My Shot`,
			description: update.summary,
			path: `/updates/${update.slug}`,
		})
	},
	component: RouteComponent,
})

function RouteComponent() {
	const { slug } = Route.useParams()
	const { data } = useSuspenseQuery(gqlQueryOptions(UpdateDocument, { slug }))
	const update = data.update

	if (!update) {
		return (
			<NotFound
				icon={<FiFileText size={22} />}
				eyebrowText="Updates"
				heading="That update isn't here"
				subtitle="It may have been taken down."
				link={{ text: "See all updates", url: "/updates" }}
			/>
		)
	}

	return (
		<VStack as="article" gap="6" alignItems="stretch" maxWidth="2xl">
			<Link to="/updates" className={arrowLink({ tone: "quiet" })}>
				← All updates
			</Link>
			<VStack gap="2" alignItems="stretch">
				{update.publishedAt && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						{formatCallDate(update.publishedAt)}
					</span>
				)}
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: "3xl",
						lineHeight: "tight",
						overflowWrap: "anywhere",
					})}
				>
					{update.title}
				</h1>
				<p className={css({ fontSize: "md", color: "fg.muted" })}>
					{update.summary}
				</p>
			</VStack>
			{update.coverImageUrl && (
				<img
					src={update.coverImageUrl}
					alt=""
					className={css({
						width: "full",
						height: "auto",
						borderRadius: "xl",
						border: "1px solid {colors.border.default}",
					})}
				/>
			)}
			<UpdateBody body={update.body} />
		</VStack>
	)
}
