import { useQueryClient } from "@tanstack/react-query"
import { ArcadeResetBar } from "#/components/arcade/arcade-reset-bar"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidateSeasonPuzzles,
	ResetMySeasonPlayDocument,
} from "#/graphql/season-puzzles/mutations"

// Today's Name That Season, played again from the start by the admin viewing
// it.
export function SeasonResetBar() {
	const queryClient = useQueryClient()
	const reset = useGqlMutation(ResetMySeasonPlayDocument)
	async function run() {
		await reset.mutateAsync()
		await invalidateSeasonPuzzles(queryClient)
	}
	return <ArcadeResetBar pending={reset.isPending} onReset={() => void run()} />
}
