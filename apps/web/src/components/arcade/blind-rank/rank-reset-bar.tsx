import { useQueryClient } from "@tanstack/react-query"
import { ArcadeResetBar } from "#/components/arcade/arcade-reset-bar"
import {
	invalidateRankPuzzles,
	ResetMyRankPlayDocument,
} from "#/graphql/blind-rank/mutations"
import { useGqlMutation } from "#/graphql/hooks"

// Today's Blind Rank, played again from the start by the admin viewing it.
export function RankResetBar() {
	const queryClient = useQueryClient()
	const reset = useGqlMutation(ResetMyRankPlayDocument)
	async function run() {
		await reset.mutateAsync()
		await invalidateRankPuzzles(queryClient)
	}
	return <ArcadeResetBar pending={reset.isPending} onReset={() => void run()} />
}
