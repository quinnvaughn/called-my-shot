import { JOIN_GIFS } from "@called-my-shot/gifs"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GroupInviteIntro } from "#/components/groups/group-invite-intro"
import { GroupInviteJoinBar } from "#/components/groups/group-invite-join-bar"
import { GroupInviteTopScorer } from "#/components/groups/group-invite-top-scorer"
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
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entry via useSuspenseQuery.
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(groupPreviewQuery(params.code))
		return { preview: data.groupPreview ?? null }
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
					url: "/home",
				}}
			/>
		)
	}

	// A signed-out visitor gets the invite framed around the person who sent
	// it, plus a line on what the app is: the call cards below assume both.
	// Not when the invite's creator is gone, since there is no one to name.
	const pitchInviter = !me && preview.invitedBy.username !== ""

	// Only for someone about to meet the signup form - a signed-in visitor
	// joins in one tap.
	const freeNote = !me && (
		<p
			className={css({
				color: "fg.subtle",
				textStyle: "metaLg",
				textAlign: "center",
			})}
		>
			free · no money, ever · takes 30 seconds
		</p>
	)

	return (
		<VStack gap="0" alignItems="stretch">
			{/* Outside the column below so it can run edge to edge. */}
			{preview.bannerUrl && <PageBanner bannerUrl={preview.bannerUrl} />}
			<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
				<GroupInviteIntro
					preview={preview}
					pitchInviter={pitchInviter}
					onJoin={handleJoin}
					joining={joining}
					freeNote={freeNote}
				/>
				{preview.topScorer && (
					<GroupInviteTopScorer
						topScorer={preview.topScorer}
						trackedLeagues={preview.trackedLeagues}
					/>
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
					freeNote={freeNote}
				/>
			</VStack>
		</VStack>
	)
}
