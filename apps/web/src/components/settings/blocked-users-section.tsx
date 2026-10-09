import { useQuery, useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { useGqlMutation } from "#/graphql/hooks"
import { UnblockUserDocument } from "#/graphql/mutations/pressers"
import { BlockedUsersDocument } from "#/graphql/queries/pressers"
import { gqlQueryOptions } from "#/graphql/query-options"
import { toIdentity } from "#/lib/identity"

// People this account blocked from its pressers. Blocking works both ways:
// neither side can ask the other a question.
export function BlockedUsersSection() {
	const { data } = useQuery(gqlQueryOptions(BlockedUsersDocument, {}))
	const unblock = useGqlMutation(UnblockUserDocument)
	const queryClient = useQueryClient()
	const users = (data?.blockedUsers ?? []).map(toIdentity)

	return (
		<Card>
			<Card.Body>
				{users.length === 0 ? (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						You haven't blocked anyone. Block someone from a question they ask
						at your presser.
					</p>
				) : (
					<VStack gap="3" alignItems="stretch">
						{users.map((user) => (
							<HStack key={user.id} justify="space-between" gap="3">
								<Identity
									name={user.name}
									username={user.username}
									avatarUrl={user.avatarUrl}
									flair={user.flair}
								/>
								<Button
									variant="outline"
									size="sm"
									disabled={unblock.isPending}
									onClick={async () => {
										await unblock.mutateAsync({ username: user.username })
										await queryClient.invalidateQueries()
									}}
								>
									Unblock
								</Button>
							</HStack>
						))}
					</VStack>
				)}
			</Card.Body>
		</Card>
	)
}
