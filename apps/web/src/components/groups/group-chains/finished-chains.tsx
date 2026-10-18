import { useInfiniteQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { finishedChainsQuery } from "#/graphql/chains/queries"
import { ChainListSection } from "./chain-list-section"

// The group's held and broken chains, newest first, ten at a time.
export function FinishedChains({ groupId }: { groupId: string }) {
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery(finishedChainsQuery(groupId))
	const chains = data?.items ?? []
	if (chains.length === 0) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<ChainListSection title="Finished" groupId={groupId} chains={chains} />
			{hasNextPage && (
				<Button
					variant="outline"
					loading={isFetchingNextPage}
					onClick={() => fetchNextPage()}
				>
					Show more
				</Button>
			)}
		</VStack>
	)
}
