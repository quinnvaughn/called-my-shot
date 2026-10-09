import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { railHeadingClass } from "#/components/questions/question-set-rail"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { GroupLogo } from "#/components/ui/group-logo"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AddBallotToGroupDocument,
	RemoveBallotFromGroupDocument,
} from "#/graphql/mutations/groups"

type Props = {
	ballotId: string
	ballotSlug: string
	boards: {
		memberCount: number
		finishedCount: number
		viewerIsAdmin: boolean
		onGroupPage: boolean
		group: { id: string; name: string; logoUrl: string | null }
	}[]
}

// The viewer's groups that follow this ballot's league, each opening that
// group's board of everyone's progress on it. In a group the viewer admins,
// this is also where the ballot gets added to or removed from the group page.
// Renders nothing when there are none.
export function BallotGroupBoards({ ballotId, ballotSlug, boards }: Props) {
	const queryClient = useQueryClient()
	const add = useGqlMutation(AddBallotToGroupDocument)
	const remove = useGqlMutation(RemoveBallotFromGroupDocument)
	const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	if (boards.length === 0) return null

	async function toggle(groupId: string, onGroupPage: boolean) {
		setError(null)
		setPendingGroupId(groupId)
		try {
			const result = onGroupPage
				? (await remove.mutateAsync({ groupId, ballotId }))
						?.removeBallotFromGroup
				: (await add.mutateAsync({ groupId, ballotId }))?.addBallotToGroup
			if (!result) {
				setError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "GroupPayload" }, async () => {
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: ["BallotByRef"] }),
						queryClient.invalidateQueries({ queryKey: ["GroupDetail"] }),
						queryClient.invalidateQueries({ queryKey: ["GroupSettings"] }),
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
		} finally {
			setPendingGroupId(null)
		}
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<span className={railHeadingClass}>This ballot in your groups</span>
			<Card>
				<VStack gap="0" alignItems="stretch">
					{boards.map(
						({
							group,
							memberCount,
							finishedCount,
							viewerIsAdmin,
							onGroupPage,
						}) => (
							<VStack
								key={group.id}
								gap="0"
								alignItems="stretch"
								className={css({
									borderBottom: "1px solid {colors.border.default}",
									_last: { borderBottom: "none" },
								})}
							>
								<Link
									to="/groups/$groupId/ballots/$ballotSlug"
									params={{ groupId: group.id, ballotSlug }}
									className={css({
										display: "block",
										flex: "1",
										minWidth: "0",
										textDecoration: "none",
										color: "inherit",
										padding: "3",
										_hover: { bg: "bg.subtle" },
									})}
								>
									<HStack gap="2.5" minWidth="0">
										<GroupLogo
											name={group.name}
											src={group.logoUrl}
											size="sm"
										/>
										<VStack gap="0.5" alignItems="flex-start" minWidth="0">
											<span
												className={css({
													fontSize: "sm",
													fontWeight: "medium",
													maxWidth: "full",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												})}
											>
												{group.name}
											</span>
											<span
												className={css({
													fontFamily: "mono",
													fontSize: "2xs",
													color: "fg.subtle",
												})}
											>
												{finishedCount} of {memberCount} finished · See
												everyone's picks →
											</span>
										</VStack>
									</HStack>
								</Link>
								{viewerIsAdmin && (
									<div
										className={css({ paddingInline: "3", paddingBottom: "3" })}
									>
										<Button
											variant="outline"
											size="sm"
											fullWidth
											disabled={pendingGroupId !== null}
											onClick={() => toggle(group.id, onGroupPage)}
										>
											{onGroupPage ? "Remove from group" : "Add to group"}
										</Button>
									</div>
								)}
							</VStack>
						),
					)}
				</VStack>
			</Card>
			<FormError message={error} />
		</VStack>
	)
}
