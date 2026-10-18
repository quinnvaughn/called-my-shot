import { useQueryClient } from "@tanstack/react-query"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import {
	ApproveChainLinkDocument,
	chainErrorMessage,
	DeclineChainLinkDocument,
	invalidateChain,
} from "#/graphql/chains/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import type { ChainLinkData } from "#/lib/chains"
import { showToast } from "#/stores/toast-store"
import { ChainLinkRow } from "./chain-link-row"

// A request waiting on the starter, with the answer on the same line.
export function ChainRequestRow({ link }: { link: ChainLinkData }) {
	const approve = useGqlMutation(ApproveChainLinkDocument)
	const decline = useGqlMutation(DeclineChainLinkDocument)
	const queryClient = useQueryClient()

	async function answer(yes: boolean) {
		const result = yes
			? (await approve.mutateAsync({ linkId: link.id }))?.approveChainLink
			: (await decline.mutateAsync({ linkId: link.id }))?.declineChainLink
		if (result?.__typename === "ChainPayload") {
			await invalidateChain(queryClient)
			return
		}
		showToast({ message: chainErrorMessage(result) })
	}

	return (
		<ChainLinkRow
			link={link}
			trailing={
				<HStack gap="2">
					<Button
						variant="outline"
						size="sm"
						loading={decline.isPending}
						onClick={() => answer(false)}
					>
						Turn down
					</Button>
					<Button
						variant="solid"
						size="sm"
						loading={approve.isPending}
						onClick={() => answer(true)}
					>
						Let them in
					</Button>
				</HStack>
			}
		/>
	)
}
