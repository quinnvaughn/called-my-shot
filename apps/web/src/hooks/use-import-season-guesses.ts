import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useGqlMutation } from "#/graphql/hooks"
import {
	ImportSeasonGuessesDocument,
	invalidateSeasonPuzzles,
} from "#/graphql/season-puzzles/mutations"
import { takeGuestSeasonGame } from "#/stores/season-puzzle-store"

// Saves the Name That Season game a player played before signing up, as soon as
// there's an account to save it to, on whatever page signing up landed on.
// The API only takes today's, and only onto an account with no game on it.
export function useImportSeasonGuesses(viewerId: string | null) {
	const queryClient = useQueryClient()
	const importGuesses = useGqlMutation(ImportSeasonGuessesDocument)

	// biome-ignore lint/correctness/useExhaustiveDependencies: once per viewer
	useEffect(() => {
		if (!viewerId) return
		const game = takeGuestSeasonGame()
		if (!game) return
		void importGuesses
			.mutateAsync({ puzzleId: game.puzzleId, guesses: game.guesses })
			.then(() => invalidateSeasonPuzzles(queryClient))
			.catch(() => {})
	}, [viewerId])
}
