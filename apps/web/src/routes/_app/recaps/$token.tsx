import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupRecapCard, recapPath } from "#/components/groups/group-recap-card"
import { SignUpPrompt } from "#/components/groups/sign-up-prompt"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { GroupRecapPageDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

const groupRecapPageQuery = (token: string) =>
	gqlQueryOptions(GroupRecapPageDocument, { token })

// Public, like /calls/:id: this url exists to be pasted into the group's own
// chat, where not everyone has an account. The token is the only way in, and
// if the group's admins turn recap links off it only opens for the group's
// members, from their Record Book. Left out of the sitemap.
export const Route = createFileRoute("/_app/recaps/$token")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			groupRecapPageQuery(params.token),
		)
		return { recap: data.groupRecap ?? null }
	},
	head: ({ loaderData, params }) => {
		const recap = loaderData?.recap
		if (!recap) return {}
		const { wins, losses, activeMembers } = recap.record
		const title = `${recap.groupName} · ${recap.weekLabel} recap`
		const meta = pageMeta({
			title,
			description: `${recap.groupName} went ${wins}–${losses} with ${activeMembers} ${pluralize(activeMembers, "member")} calling.`,
			path: recapPath(params.token),
			image: {
				// Changes whenever anything on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param.
				path: `/share/recaps/${params.token}/card.png?v=${recap.cardVersion}`,
				alt: title,
			},
		})
		// Kept out of search rather than out of robots.txt: a group's name and
		// members are for its own chat, but the unfurl scrapers that chat uses
		// still have to be able to fetch the page.
		return {
			...meta,
			meta: [...meta.meta, { name: "robots", content: "noindex" }],
		}
	},
})

function RouteComponent() {
	const { token } = Route.useParams()
	const me = useMe()
	const { data } = useSuspenseQuery(groupRecapPageQuery(token))
	const recap = data.groupRecap

	if (!recap) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Recap"
				heading="This recap isn't available"
				subtitle="The link may be wrong, or the group has turned off recap links."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "3xl" })}>
			{recap.groupId && (
				<Breadcrumb>
					<Breadcrumb.Link to="/groups">Groups</Breadcrumb.Link>
					<Breadcrumb.Link
						to="/groups/$groupId"
						params={{ groupId: recap.groupId }}
					>
						{recap.groupName}
					</Breadcrumb.Link>
					<Breadcrumb.Current>{recap.weekLabel}</Breadcrumb.Current>
				</Breadcrumb>
			)}
			<PageHeader
				title={recap.groupName}
				subtitle={`Weekly recap · ${recap.weekLabel}`}
			/>
			<GroupRecapCard recap={recap} groupName={recap.groupName} />
			{!me && <SignUpPrompt />}
		</VStack>
	)
}
