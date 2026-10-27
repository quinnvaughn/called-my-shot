import { useQueryClient } from "@tanstack/react-query"
import { ArcadeResetBar } from "#/components/arcade/arcade-reset-bar"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidateTeammateChain,
	ResetMyTeammateChainPlayDocument,
} from "#/graphql/teammate-chain/mutations"

// Today's Teammate Chain, played again from the start by the admin viewing
// it.
export function ChainResetBar() {
	const queryClient = useQueryClient()
	const reset = useGqlMutation(ResetMyTeammateChainPlayDocument)
	async function run() {
		await reset.mutateAsync()
		await invalidateTeammateChain(queryClient)
	}
	return <ArcadeResetBar pending={reset.isPending} onReset={() => void run()} />
}
