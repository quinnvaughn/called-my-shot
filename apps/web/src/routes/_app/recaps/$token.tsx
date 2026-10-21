import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupInviteJoinBar } from "#/components/groups/group-invite-join-bar"
import { GroupRecapCard, recapPath } from "#/components/groups/group-recap-card"
import { Button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { groupRecapPageQuery } from "#/graphql/groups/queries"
import { useJoinGroupFlow } from "#/hooks/use-join-group-flow"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

// The link a recap is shared by, pasted into the group's own chat. Public,
// like /calls/:id: not everyone in a chat has an account or is in the group
// yet, and for them the recap is a way in, with a Join button that adds them
// straight to the group. A member is sent on to the group's own copy of the
// recap. The token is the only way in, and while the group's admins have
// recap links off, only members get anything back. Left out of the sitemap.
export const Route = createFileRoute("/_app/recaps/$token")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			groupRecapPageQuery(params.token),
		)
		const recap = data.groupRecap ?? null
		// groupId only comes back for a member.
		if (recap?.groupId) {
			throw redirect({
				to: "/groups/$groupId/recaps/$token",
				params: { groupId: recap.groupId, token: params.token },
			})
		}
		return { recap }
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
	const { data } = useSuspenseQuery(groupRecapPageQuery(token))
	const recap = data.groupRecap
	const requireAuth = useRequireAuth()
	const { joinGroupFromRecap, isPending: joining } = useJoinGroupFlow()

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

	const groupName = recap.groupName
	function handleJoin() {
		requireAuth(
			() => {
				void joinGroupFromRecap(token)
			},
			{
				signup: {
					title: `Sign up to join ${groupName}`,
					description: "Create a free account and you're in the group.",
				},
				signin: {
					title: `Sign in to join ${groupName}`,
					description: "Log back in and you're in the group.",
				},
			},
			{ intent: { kind: "join_group_recap", token }, surface: "group_invite" },
		)
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title={groupName}
				subtitle={`Weekly recap · ${recap.weekLabel}`}
				action={
					// Below lg the join bar pinned to the bottom of the screen
					// does this.
					<span className={css({ display: { base: "none", lg: "block" } })}>
						<Button variant="solid" onClick={handleJoin} loading={joining}>
							Join {groupName}
						</Button>
					</span>
				}
			/>
			<GroupRecapCard recap={recap} groupName={groupName} />
			<GroupInviteJoinBar
				groupName={groupName}
				onJoin={handleJoin}
				joining={joining}
			/>
		</VStack>
	)
}
