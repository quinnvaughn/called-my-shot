import { useInfiniteQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { finishedChainsQuery } from "#/graphql/chains/queries"
import { CHAIN_BONUS_PCT } from "#/lib/chains"
import { openModal } from "#/stores/modal-store"
import type { ChainListItem } from "./chain-list-row"
import { ChainListSection } from "./chain-list-section"
import { FinishedChains } from "./finished-chains"
import { StartChainModal } from "./start-chain-modal"

// The group's Chains tab: what's taking links, what's playing out, and the
// ones that held or broke.
export function GroupChains({
	groupId,
	chains,
	canStart,
}: {
	groupId: string
	chains: ChainListItem[]
	canStart: boolean
}) {
	const { data: finished } = useInfiniteQuery(finishedChainsQuery(groupId))
	const hasFinished = (finished?.items.length ?? 0) > 0
	const open = chains.filter((chain) => chain.phase === "OPEN")
	const live = chains.filter((chain) => chain.phase === "LIVE")
	return (
		<VStack gap="6" alignItems="stretch">
			<HStack justify="space-between" gap="4" flexWrap="wrap">
				<p className={css({ fontSize: "sm", color: "fg.muted", flex: "1" })}>
					Everyone in a chain puts in one call on a different game. If every
					link hits, every win is multiplied by the odds plus {CHAIN_BONUS_PCT}
					%. If one misses, every hit in the chain scores 0 and every miss loses
					its points as usual.
				</p>
				{canStart && (
					<Button
						variant="solid"
						onClick={() => openModal(<StartChainModal groupId={groupId} />)}
					>
						Start a chain
					</Button>
				)}
			</HStack>
			{chains.length === 0 && !hasFinished && (
				<EmptyState>No chains in this group yet.</EmptyState>
			)}
			<ChainListSection title="Taking links" groupId={groupId} chains={open} />
			<ChainListSection title="Playing out" groupId={groupId} chains={live} />
			<FinishedChains groupId={groupId} />
		</VStack>
	)
}
