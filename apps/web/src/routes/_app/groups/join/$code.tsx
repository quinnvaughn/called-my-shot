import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PageBanner } from "#/components/images/page-banner"
import { CallCard } from "#/components/questions/call-card"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { GroupLogo } from "#/components/ui/group-logo"
import { NotFound } from "#/components/ui/not-found"
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
	const topScorerLabel =
		preview.trackedLeagues.length === 1
			? `${preview.trackedLeagues[0].abbreviation} top scorer this season:`
			: "top scorer this season:"

	return (
		<VStack gap="0" alignItems="stretch">
			{/* Outside the padded column below so it can run edge to edge. */}
			{preview.bannerUrl && <PageBanner bannerUrl={preview.bannerUrl} />}
			<VStack gap="4" alignItems="center" className={css({ padding: "8" })}>
				{preview.logoUrl && (
					<GroupLogo size="lg" name={preview.name} src={preview.logoUrl} />
				)}
				<Eyebrow variant="neutral">You've been invited to a group</Eyebrow>
				<h1 className={css({ fontFamily: "heading", fontSize: "2xl" })}>
					{preview.name}
				</h1>
				{preview.description && (
					<p
						className={css({
							maxWidth: "md",
							fontSize: "sm",
							color: "fg.muted",
							lineHeight: "relaxed",
							textAlign: "center",
						})}
					>
						{preview.description}
					</p>
				)}
				<AvatarStack members={preview.members} />
				<p
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
					})}
				>
					{preview.memberCount} {pluralize(preview.memberCount, "member")} ·{" "}
					{leaguesLabel} · invited by {preview.invitedBy.name} (@
					{preview.invitedBy.username})
				</p>
				{preview.topScorer && (
					<Card size="sm">
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
				<Button
					variant="solid"
					size="md"
					onClick={handleJoin}
					loading={joinGroupByCode.isPending}
				>
					Join {preview.name}
				</Button>
				{preview.recentCalls.length > 0 && (
					<VStack
						gap="3"
						alignItems="stretch"
						className={css({ width: "full", maxWidth: "xl", marginTop: "4" })}
					>
						<Eyebrow variant="neutral">Latest calls in the group</Eyebrow>
						{/* Unlinked: clicking through would leave the invite
						behind before the visitor has joined. */}
						{preview.recentCalls.map((call) => (
							<CallCard key={call.id} call={call} linked={false} />
						))}
					</VStack>
				)}
			</VStack>
		</VStack>
	)
}
