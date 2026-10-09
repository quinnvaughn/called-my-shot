import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { BallotCard } from "#/components/ballots/ballot-card"
import { CardRail } from "#/components/ui/card-rail"
import { FormError } from "#/components/ui/form-error"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import { RemoveBallotFromGroupDocument } from "#/graphql/mutations/groups"

export const GroupBallotsStripBallotFragment = graphql(`
	fragment GroupBallotsStrip_groupBallot on GroupBallot {
		id
		memberStartedCount
		memberFinishedCount
		ballot {
			id
			slug
			...BallotCard_ballot
		}
	}
`)

type Props = {
	groupId: string
	ballots: FragmentType<typeof GroupBallotsStripBallotFragment>[]
	viewerIsAdmin: boolean
}

const removeButton = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "7",
	height: "7",
	borderRadius: "md",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.default", bg: "bg.subtle" },
	_disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "none" } },
})

// The ballots the group's admins have added to its page, newest first, each
// linking to the group's board for it. They stay through resolution until an
// admin removes one here or from the ballot's page, which is also where
// they're added. Renders nothing when there are none.
export function GroupBallotsStrip({
	groupId,
	ballots: ballotsProp,
	viewerIsAdmin,
}: Props) {
	const ballots = useFragment(GroupBallotsStripBallotFragment, ballotsProp)
	const queryClient = useQueryClient()
	const remove = useGqlMutation(RemoveBallotFromGroupDocument)
	const [error, setError] = useState<string | null>(null)
	if (ballots.length === 0) return null

	async function handleRemove(ballotId: string) {
		setError(null)
		const result = (await remove.mutateAsync({ groupId, ballotId }))
			?.removeBallotFromGroup
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "GroupPayload" }, async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: ["GroupDetail"] }),
					queryClient.invalidateQueries({ queryKey: ["BallotByRef"] }),
				])
			})
			.with(
				{ __typename: "AuthenticationError" },
				{ __typename: "AuthorizationError" },
				{ __typename: "NotFoundError" },
				{ __typename: "ValidationError" },
				async (r) => {
					setError(r.message)
				},
			)
			.exhaustive()
	}

	return (
		<VStack gap="2" alignItems="stretch">
			<CardRail
				items={ballots}
				getKey={(entry) => entry.id}
				itemLabel="ballot"
				header={
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							letterSpacing: "wide",
							color: "fg.muted",
							textTransform: "uppercase",
						})}
					>
						Ballots
					</span>
				}
				renderItem={(entry) => (
					<VStack gap="1.5" alignItems="stretch" height="full">
						<div className={css({ flex: "1" })}>
							<BallotCard ballot={entry.ballot} />
						</div>
						<HStack justify="space-between" gap="2" minHeight="7">
							<Link
								to="/groups/$groupId/ballots/$ballotSlug"
								params={{ groupId, ballotSlug: entry.ballot.slug }}
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
									textDecoration: "none",
									_hover: { color: "fg.default" },
								})}
							>
								{entry.memberFinishedCount} finished ·{" "}
								{entry.memberStartedCount} started →
							</Link>
							{viewerIsAdmin && (
								<button
									type="button"
									className={removeButton}
									aria-label="Remove from group"
									disabled={remove.isPending}
									onClick={() => handleRemove(entry.id)}
								>
									<FiX size={15} />
								</button>
							)}
						</HStack>
					</VStack>
				)}
			/>
			<FormError message={error} />
		</VStack>
	)
}
