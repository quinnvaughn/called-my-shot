import { JOIN_GIFS } from "@called-my-shot/gifs"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupInviteLanding } from "#/components/groups/group-invite/group-invite-landing"
import { GroupInviteLeaders } from "#/components/groups/group-invite/group-invite-leaders"
import { GroupInviteIntro } from "#/components/groups/group-invite-intro"
import { GroupInviteJoinBar } from "#/components/groups/group-invite-join-bar"
import { PageBanner } from "#/components/images/page-banner"
import { CallCard } from "#/components/questions/call-card"
import { CardRail } from "#/components/ui/card-rail"
import { Eyebrow } from "#/components/ui/eyebrow"
import { NotFound } from "#/components/ui/not-found"
import { ReactionGif } from "#/components/ui/reaction-gif"
import { GroupPreviewDocument } from "#/graphql/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useJoinGroupFlow } from "#/hooks/use-join-group-flow"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

const groupPreviewQuery = (code: string) =>
	gqlQueryOptions(GroupPreviewDocument, { code })

// Public - unauthed visitors land here from an invite link and need to see
// the group before we ask them to sign up, so this route sits outside
// _authed rather than nesting under /groups.
export const Route = createFileRoute("/_app/groups/join/$code")({
	component: RouteComponent,
	// Signed out, the page is its own landing rather than a page in the app
	// (see GroupInviteLanding).
	staticData: { bareSignedOut: true },
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entry via useSuspenseQuery.
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(groupPreviewQuery(params.code))
		const preview = data.groupPreview ?? null
		// A member opening their own group's link has nothing to join.
		if (preview?.viewerIsMember) {
			throw redirect({
				to: "/groups/$groupId",
				params: { groupId: preview.id },
			})
		}
		return { preview }
	},
	head: ({ loaderData, params }) => {
		const preview = loaderData?.preview
		if (!preview) return {}

		return pageMeta({
			title: `Join ${preview.name} on Called My Shot`,
			// The group's own pitch, when it has one, says more to someone
			// deciding from a link preview than the member count does.
			description: preview.description
				? `${preview.invitedBy.name} invited you to join ${preview.name}. ${preview.description}`
				: `${preview.invitedBy.name} invited you to join ${preview.name} - ${preview.memberCount} ${pluralize(preview.memberCount, "member")} already calling their shots.`,
			path: `/groups/join/${params.code}`,
		})
	},
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { data } = useSuspenseQuery(groupPreviewQuery(code))
	const preview = data.groupPreview
	const requireAuth = useRequireAuth()
	const { joinGroup, isPending: joining } = useJoinGroupFlow()
	const { me } = Route.useRouteContext()

	function handleJoin() {
		requireAuth(
			() => {
				void joinGroup(code)
			},
			{
				signup: {
					title: `Sign up to join ${preview ? preview.name : "the group"}`,
					description: "Create a free account to lock in your invite.",
				},
				signin: {
					title: `Sign in to join ${preview ? preview.name : "the group"}`,
					description: "Log back in to accept this invite.",
				},
			},
			{ intent: { kind: "join_group", code }, surface: "group_invite" },
		)
	}

	if (!preview) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Invite link"
				heading="This link isn't valid anymore"
				subtitle="It may have expired, been reset, or never existed. Ask whoever invited you for a new one."
				link={{
					text: "Back to home",
					url: "/",
				}}
			/>
		)
	}

	if (!me) {
		return (
			<GroupInviteLanding
				preview={preview}
				onJoin={handleJoin}
				joining={joining}
			/>
		)
	}

	return (
		<VStack gap="0" alignItems="stretch">
			{/* Outside the column below so it can run edge to edge. */}
			{preview.bannerUrl && <PageBanner bannerUrl={preview.bannerUrl} />}
			<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
				<GroupInviteIntro
					preview={preview}
					onJoin={handleJoin}
					joining={joining}
				/>
				{preview.leaders.length > 0 && (
					<GroupInviteLeaders leaders={preview.leaders} />
				)}
				<ReactionGif pool={JOIN_GIFS} />
				{preview.recentCalls.length > 0 && (
					// Unlinked: clicking through would leave the invite behind
					// before the visitor has joined.
					<CardRail
						items={preview.recentCalls}
						getKey={(call) => call.id}
						renderItem={(call) => <CallCard call={call} linked={false} />}
						itemLabel="call"
						header={
							<Eyebrow variant="neutral">Latest calls in the group</Eyebrow>
						}
					/>
				)}
				<GroupInviteJoinBar
					groupName={preview.name}
					onJoin={handleJoin}
					joining={joining}
				/>
			</VStack>
		</VStack>
	)
}
