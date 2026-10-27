import { useSuspenseQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ArcadePracticeBar } from "#/components/arcade/arcade-practice-bar"
import { EmptyState } from "#/components/ui/empty-state"
import { adminTeammateChainPuzzleQuery } from "#/graphql/teammate-chain/queries"
import { TeammateChainGame } from "./teammate-chain-game"

// An admin playing any scheduled day's chain start to finish, with nothing
// saved. Starting over remounts the game empty.
export function ChainPractice({ date }: { date: string }) {
	const { data } = useSuspenseQuery(adminTeammateChainPuzzleQuery(date))
	const [round, setRound] = useState(0)
	const puzzle = data.adminTeammateChainPuzzle
	if (puzzle.__typename !== "TeammateChainPuzzle") {
		return (
			<EmptyState>
				{puzzle.__typename === "NotFoundError"
					? "Nothing is scheduled that day."
					: "Only admins can practice a day's chain."}
			</EmptyState>
		)
	}
	return (
		<>
			<ArcadePracticeBar
				date={puzzle.date}
				schedulePath="/admin/teammate-chain"
				onRestart={() => setRound(round + 1)}
			/>
			<TeammateChainGame
				key={`${puzzle.id}:${round}`}
				puzzle={{ ...puzzle, viewerPlay: null }}
				practice
			/>
		</>
	)
}
