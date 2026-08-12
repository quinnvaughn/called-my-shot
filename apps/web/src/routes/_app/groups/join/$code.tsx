import { useMutation } from "@apollo/client/react"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { IncorrectGroup } from "#/components/groups/incorrect-group"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { JoinGroupByCodeDocument } from "#/graphql/generated/graphql"
import { GroupPreviewDocument } from "#/graphql/queries/groups"
import { useRequireAuth } from "#/hooks/use-require-auth"

// Public - unauthed visitors land here from an invite link and need to see
// the group before we ask them to sign up, so this route sits outside
// _authed rather than nesting under /groups.
export const Route = createFileRoute("/_app/groups/join/$code")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: GroupPreviewDocument,
			variables: { code: params.code },
		})

		return { preview: data?.groupPreview ?? null }
	},
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { preview } = Route.useLoaderData()
	const requireAuth = useRequireAuth()
	const [joinGroupByCode, { loading }] = useMutation(JoinGroupByCodeDocument)
	const router = useRouter()
	const navigate = useNavigate()

	function handleJoin() {
		requireAuth(
			async () => {
				const { data } = await joinGroupByCode({
					variables: { input: { code } },
				})
				const result = data?.joinGroupByCode

				if (result?.__typename === "GroupPayload") {
					await router.invalidate()
					await navigate({
						to: "/groups/$groupId",
						params: { groupId: result.group.id },
					})
				}
			},
			{
				signup: {
					title: `Sign up to join ${preview.name}`,
					description: "Create a free account to lock in your invite.",
				},
				signin: {
					title: `Sign in to join ${preview.name}`,
					description: "Log back in to accept this invite.",
				},
			},
		)
	}

	if (!preview) {
		return (
			<IncorrectGroup
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

	return (
		<VStack gap="4" alignItems="center" className={css({ padding: "8" })}>
			<Eyebrow variant="neutral">You've been invited to a group</Eyebrow>
			<h1 className={css({ fontFamily: "heading", fontSize: "2xl" })}>
				{preview.name}
			</h1>
			<AvatarStack members={preview.members} />
			<p
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.muted",
				})}
			>
				{preview.memberCount} members · invited by {preview.invitedBy.name} (@
				{preview.invitedBy.username})
			</p>
			<Card size="sm">
				<Card.Body>
					<p
						className={css({
							color: "fg.muted",
							fontSize: "xs",
							fontFamily: "mono",
						})}
					>
						top scorer in this league:{" "}
						<b className={css({ color: "fg.default" })}>
							{preview.topScorer.name} (@{preview.topScorer.username}) ·{" "}
							{preview.topScorer.points} pts
						</b>
					</p>
				</Card.Body>
			</Card>
			<Button variant="solid" size="md" onClick={handleJoin} loading={loading}>
				Join {preview.name}
			</Button>
		</VStack>
	)
}
