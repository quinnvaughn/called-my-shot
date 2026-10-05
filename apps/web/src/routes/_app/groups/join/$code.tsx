import { JOIN_GIFS } from "@called-my-shot/gifs"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GroupHeader } from "#/components/groups/group-header"
import { PageBanner } from "#/components/images/page-banner"
import { CallCard } from "#/components/questions/call-card"
import { Avatar } from "#/components/ui/avatar"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { CardRail } from "#/components/ui/card-rail"
import { Eyebrow } from "#/components/ui/eyebrow"
import { NotFound } from "#/components/ui/not-found"
import { ReactionGif } from "#/components/ui/reaction-gif"
import { JoinGroupByCodeDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { GroupPreviewDocument } from "#/graphql/queries/groups"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { track } from "#/lib/analytics"
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
	const joinGroupByCode = useGqlMutation(JoinGroupByCodeDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { me } = Route.useRouteContext()

	function handleJoin() {
		requireAuth(
			async () => {
				const data = await joinGroupByCode.mutateAsync({ input: { code } })
				const result = data?.joinGroupByCode

				if (result?.__typename === "GroupPayload") {
					track("group_joined", {
						groupId: result.group.id,
						source: "invite_link",
					})
					await queryClient.invalidateQueries()
					await router.invalidate()
					await navigate({
						to: "/groups/$groupId",
						params: { groupId: result.group.id },
					})
				}
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

	// An empty list means the group counts every league.
	const leaguesLabel =
		preview.trackedLeagues.length === 0
			? "all leagues"
			: preview.trackedLeagues
					.map((league) => league.abbreviation)
					.sort()
					.join(", ")
	// A signed-out visitor gets the invite framed around the person who sent
	// it, plus a line on what the app is: the call cards below assume both.
	// Not when the invite's creator is gone, since there is no one to name.
	const pitchInviter = !me && preview.invitedBy.username !== ""
	const topScorerLabel =
		preview.trackedLeagues.length === 1
			? `${preview.trackedLeagues[0].abbreviation} top scorer this season:`
			: "top scorer this season:"

	// Only for someone about to meet the signup form - a signed-in visitor
	// joins in one tap.
	const freeNote = !me && (
		<p
			className={css({
				color: "fg.subtle",
				fontFamily: "mono",
				fontSize: "xs",
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
				<VStack gap="3" alignItems="stretch">
					{pitchInviter ? (
						<HStack gap="2.5" alignItems="center">
							<Avatar
								name={preview.invitedBy.name}
								src={preview.invitedBy.avatarUrl}
								size="sm"
							/>
							<Eyebrow variant="neutral">
								@{preview.invitedBy.username} invited you
							</Eyebrow>
						</HStack>
					) : (
						<Eyebrow variant="neutral">You've been invited to a group</Eyebrow>
					)}
					{/* The group page's own header, so joining lands on the shape
					the invite already showed. From lg up the button takes the
					header's action slot; below lg it's the pinned bar at the end
					of the page instead. */}
					<GroupHeader
						name={preview.name}
						logoUrl={preview.logoUrl}
						description={preview.description}
						links={[]}
						large
						actions={
							<VStack
								alignItems="stretch"
								gap="2"
								className={css({
									display: { base: "none", lg: "flex" },
									// The page's one job, so it stays the size it had as
									// its own row rather than shrinking to fit the slot.
									minWidth: "xs",
								})}
							>
								<Button
									variant="solid"
									size="lg"
									fullWidth
									onClick={handleJoin}
									loading={joinGroupByCode.isPending}
								>
									Join {preview.name}
								</Button>
								{freeNote}
							</VStack>
						}
					/>
					<HStack gap="3" alignItems="center" flexWrap="wrap">
						<AvatarStack members={preview.members} />
						<p
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
							})}
						>
							{preview.memberCount} {pluralize(preview.memberCount, "member")} ·{" "}
							{leaguesLabel}
							{/* The eyebrow already names them when pitching. */}
							{!pitchInviter &&
								` · invited by ${preview.invitedBy.name} (@${preview.invitedBy.username})`}
						</p>
					</HStack>
					{pitchInviter && (
						<p
							className={css({
								maxWidth: "2xl",
								lineHeight: "relaxed",
								color: "fg.body",
							})}
						>
							Make calls on NFL, NBA, MLB and NHL games and whole seasons, or
							write your own questions for others to call. Every call is scored
							once the result is in, and {preview.name} ranks its members on its
							own leaderboard.
						</p>
					)}
				</VStack>
				{preview.topScorer && (
					<Card size="sm" className={css({ alignSelf: "flex-start" })}>
						<Card.Body>
							<p
								className={css({
									color: "fg.muted",
									fontSize: "xs",
									fontFamily: "mono",
								})}
							>
								{topScorerLabel}{" "}
								<b className={css({ color: "fg.default" })}>
									{preview.topScorer.name} (@{preview.topScorer.username}) ·{" "}
									{preview.topScorer.points} pts
								</b>
							</p>
						</Card.Body>
					</Card>
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
				{/* Below lg, sticks to the bottom of the viewport over a backdrop
				that runs edge to edge while the button keeps the column's width.
				It has to stay last in the page to stay pinned the whole way down:
				a sticky element lets go once the page scrolls past where it sits.
				Same bar as /join/$code. */}
				<VStack
					alignItems="stretch"
					gap="2"
					className={css({
						width: "full",
						maxWidth: "md",
						alignSelf: "center",
						position: "sticky",
						bottom: "0",
						zIndex: 10,
						paddingBlock: "3",
						// Pulls the bar down over <main>'s bottom padding (5 below
						// xl), so at the end of the page it rests flush with the
						// viewport the same way it sits while pinned.
						marginBottom: "-5",
						_before: {
							content: '""',
							position: "absolute",
							insetBlock: "0",
							left: "50%",
							width: "100vw",
							transform: "translateX(-50%)",
							zIndex: -1,
							bg: "bg.canvas/92",
							backdropFilter: "blur(10px)",
							borderTop: "1px solid {colors.border.default}",
						},
						lg: { display: "none" },
					})}
				>
					<Button
						variant="solid"
						size="md"
						fullWidth
						onClick={handleJoin}
						loading={joinGroupByCode.isPending}
					>
						Join {preview.name}
					</Button>
					{freeNote}
				</VStack>
			</VStack>
		</VStack>
	)
}
