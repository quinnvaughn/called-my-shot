import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { z } from "zod"
import { PostFeed } from "#/components/posts/post-feed"
import { PromptBreadcrumb } from "#/components/posts/prompt-breadcrumb"
import { PromptConsensusCard } from "#/components/posts/prompt-consensus-card"
import { RushmoreEyebrow } from "#/components/posts/rushmore-eyebrow"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { UserHandle } from "#/components/users/user-handle"
import { promptAnswersQuery, promptPageQuery } from "#/graphql/posts/queries"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { promptFilters, promptScope } from "#/lib/prompt-scope"
import { promptSpace } from "#/lib/prompt-space"

// A prompt's page, and the address printed on the crowd's Rushmore image
// (calledmyshot.com/rushmore/<code>): the consensus four, the way in to making
// your own, and everyone's answers.
export const Route = createFileRoute("/_app/rushmore/$code")({
	component: RouteComponent,
	validateSearch: z.object({
		sort: z.enum(["TOP", "NEWEST"]).optional().catch(undefined),
	}),
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(promptPageQuery(params.code))
		const prompt = data.prompt
		return {
			space: prompt ? promptSpace(prompt) : null,
			meta: prompt
				? {
						title: prompt.title,
						answerCount: prompt.answerCount,
						consensus: prompt.consensus.map((pick) => pick.player.name),
					}
				: null,
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		const answers = `${meta.answerCount} ${pluralize(meta.answerCount, "Rushmore")}`
		return pageMeta({
			title: `Mount Rushmore: ${meta.title} | Called My Shot`,
			description:
				meta.answerCount > 0
					? `The four picked most across ${answers}: ${meta.consensus.join(", ")}. Make yours.`
					: "Nobody has made this Rushmore yet. Pick your four and be the first.",
			path: `/rushmore/${params.code}`,
			image: {
				path: `/share/rushmore-prompts/${params.code}/card.png?v=${meta.answerCount}`,
				alt: `Mount Rushmore: ${meta.title}, picked by ${answers}`,
			},
		})
	},
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { sort = "TOP" } = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data } = useSuspenseQuery(promptPageQuery(code))
	const prompt = data.prompt

	if (!prompt) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Rushmore"
				heading="This Rushmore prompt doesn't exist"
				subtitle="Check the link with whoever sent it."
				link={{ text: "Back to home", url: "/home" }}
			/>
		)
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<VStack gap="1" alignItems="stretch">
				{prompt.league ? (
					<PromptBreadcrumb prompt={{ ...prompt, league: prompt.league }} />
				) : (
					<span className={css({ textStyle: "label", color: "fg.muted" })}>
						{promptScope(prompt)}
					</span>
				)}
				<span className={css({ color: "fg.muted", marginTop: "2" })}>
					<RushmoreEyebrow />
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
				{/* Without a league, the label above already says these. */}
				{prompt.league && promptFilters(prompt) && (
					<p className={css({ textStyle: "label", color: "fg.muted" })}>
						{promptFilters(prompt)}
					</p>
				)}
				{prompt.creator && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Prompt by <UserHandle user={prompt.creator} />
					</p>
				)}
			</VStack>
			<PromptConsensusCard code={code} showTitle={false} />
			<VStack gap="3" alignItems="stretch">
				<HStack justify="space-between" gap="3" flexWrap="wrap">
					<h2
						className={css({ textStyle: "sectionHeading", color: "fg.muted" })}
					>
						{prompt.answerCount} {pluralize(prompt.answerCount, "Rushmore")}
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
						<Tabs.List variant="pill" aria-label="Order Rushmores by">
							<Tabs.Trigger value="TOP">Most liked</Tabs.Trigger>
							<Tabs.Trigger value="NEWEST">Newest</Tabs.Trigger>
						</Tabs.List>
					</Tabs>
				</HStack>
				<PostFeed
					query={promptAnswersQuery({ code, sort })}
					empty={<EmptyState>No Rushmores for this prompt yet.</EmptyState>}
				/>
			</VStack>
		</VStack>
	)
}
