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
	PinBallotToGroupDocument,
	UnpinBallotFromGroupDocument,
} from "#/graphql/mutations/groups"

type Props = {
	ballotId: string
	ballotSlug: string
	// False once everything on the ballot has locked. Unpinning stays
	// available either way.
	canPin: boolean
	boards: {
		memberCount: number
		finishedCount: number
		viewerIsAdmin: boolean
		isPinned: boolean
		group: { id: string; name: string; logoUrl: string | null }
	}[]
}

// The viewer's groups that follow this ballot's league, each opening that
// group's board of everyone's progress on it. In a group the viewer admins,
// this is also where the ballot gets pinned to the top of the group page.
// Renders nothing when there are none.
export function BallotGroupBoards({
	ballotId,
	ballotSlug,
	canPin,
	boards,
}: Props) {
	const queryClient = useQueryClient()
	const pin = useGqlMutation(PinBallotToGroupDocument)
	const unpin = useGqlMutation(UnpinBallotFromGroupDocument)
	const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	if (boards.length === 0) return null

	async function togglePin(groupId: string, pinned: boolean) {
		setError(null)
		setPendingGroupId(groupId)
		try {
			const result = pinned
				? (await unpin.mutateAsync({ groupId, ballotId }))?.unpinBallotFromGroup
				: (await pin.mutateAsync({ groupId, ballotId }))?.pinBallotToGroup
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
							isPinned,
						}) => (
							<HStack
								key={group.id}
								gap="2"
								className={css({
									paddingInlineEnd: "3",
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
								{viewerIsAdmin && (isPinned || canPin) && (
									<Button
										variant={isPinned ? "ghost" : "outline"}
										size="sm"
										disabled={pendingGroupId !== null}
										onClick={() => togglePin(group.id, isPinned)}
									>
										{isPinned ? "Unpin" : "Pin"}
									</Button>
								)}
							</HStack>
						),
					)}
				</VStack>
			</Card>
			<FormError message={error} />
		</VStack>
	)
}
