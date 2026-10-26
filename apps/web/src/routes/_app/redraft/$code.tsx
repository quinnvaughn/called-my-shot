import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { z } from "zod"
import { PostFeed } from "#/components/posts/post-feed"
import { RedraftConsensusCard } from "#/components/posts/redraft/redraft-consensus-card"
import { RedraftEyebrow } from "#/components/posts/redraft/redraft-eyebrow"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import {
	redraftAnswersQuery,
	redraftPromptPageQuery,
} from "#/graphql/posts/queries"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { promptSpace } from "#/lib/prompt-space"

// A draft class's page, and the address printed on the crowd's redraft image
// (calledmyshot.com/redraft/<code>): the crowd's redraft, the way in to
// making your own, and everyone's redrafts.
export const Route = createFileRoute("/_app/redraft/$code")({
	component: RouteComponent,
	validateSearch: z.object({
		sort: z.enum(["TOP", "NEWEST"]).optional().catch(undefined),
	}),
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			redraftPromptPageQuery(params.code),
		)
		const prompt = data.redraftPrompt
		return {
			space: prompt ? promptSpace({ league: prompt.league, team: null }) : null,
			meta: prompt
				? {
						title: prompt.title,
						answerCount: prompt.answerCount,
						top: prompt.consensus
							.slice(0, 3)
							.map((pick) => `${pick.slot}. ${pick.player.name}`),
					}
				: null,
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		const answers = `${meta.answerCount} ${pluralize(meta.answerCount, "redraft")}`
		return pageMeta({
			title: `Redraft the ${meta.title} | Called My Shot`,
			description:
				meta.answerCount > 0
					? `The crowd's redraft across ${answers}: ${meta.top.join(", ")}. Make yours.`
					: "Nobody has redrafted this class yet. Knowing how every career turned out, who goes first?",
			path: `/redraft/${params.code}`,
			image: {
				path: `/share/redraft-prompts/${params.code}/card.png?v=${meta.answerCount}`,
				alt: `The crowd's redraft of the ${meta.title}, from ${answers}`,
			},
		})
	},
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { sort = "TOP" } = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery(redraftPromptPageQuery(code))
	const prompt = data.redraftPrompt

	if (!prompt) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Redraft"
				heading="This draft class isn't here"
				subtitle="Check the link with whoever sent it."
				link={{ text: "Back to home", url: "/" }}
			/>
		)
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<VStack gap="1" alignItems="stretch">
				{prompt.league && (
					<Breadcrumb>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug"
							params={{ leagueSlug: prompt.league.slug }}
						>
							{prompt.league.abbreviation}
						</Breadcrumb.Link>
						<Breadcrumb.Current>{prompt.title}</Breadcrumb.Current>
					</Breadcrumb>
				)}
				<span className={css({ color: "fg.muted", marginTop: "2" })}>
					<RedraftEyebrow />
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: "3xl",
						lineHeight: "1.1",
						overflowWrap: "anywhere",
					})}
				>
					{prompt.title}
				</h1>
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Pick the class over again, knowing how every career turned out. Each
					slot belongs to the team that held the pick.
				</p>
			</VStack>
			<RedraftConsensusCard code={code} />
			<VStack gap="3" alignItems="stretch">
				<HStack justify="space-between" gap="3" flexWrap="wrap">
					<h2
						className={css({ textStyle: "sectionHeading", color: "fg.muted" })}
					>
						{prompt.answerCount} {pluralize(prompt.answerCount, "redraft")}
					</h2>
					<Tabs
						value={sort}
						onValueChange={(next) =>
							void navigate({
								search: { sort: next === "TOP" ? undefined : next },
								replace: true,
							})
						}
					>
						<Tabs.List variant="pill" aria-label="Order redrafts by">
							<Tabs.Trigger value="TOP">Most liked</Tabs.Trigger>
							<Tabs.Trigger value="NEWEST">Newest</Tabs.Trigger>
						</Tabs.List>
					</Tabs>
				</HStack>
				<PostFeed
					query={redraftAnswersQuery({ code, sort })}
					empty={<EmptyState>Nobody has redrafted this class yet.</EmptyState>}
				/>
			</VStack>
		</VStack>
	)
}
