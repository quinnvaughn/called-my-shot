import { useSuspenseQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ArcadePracticeBar } from "#/components/arcade/arcade-practice-bar"
import { EmptyState } from "#/components/ui/empty-state"
import { adminRankPuzzleQuery } from "#/graphql/blind-rank/queries"
import { BlindRankGame } from "./blind-rank-game"

// An admin playing any scheduled day's puzzle start to finish, with nothing
// saved. Starting over remounts the game empty.
export function RankPractice({ date }: { date: string }) {
	const { data } = useSuspenseQuery(adminRankPuzzleQuery(date))
	const [round, setRound] = useState(0)
	const puzzle = data.adminRankPuzzle
	if (puzzle.__typename !== "RankPuzzle") {
		return (
			<EmptyState>
				{puzzle.__typename === "NotFoundError"
					? "Nothing is scheduled that day."
					: "Only admins can practice a day's puzzle."}
			</EmptyState>
		)
	}
	return (
		<>
			<ArcadePracticeBar
				date={puzzle.date}
				schedulePath="/admin/blind-rank"
				onRestart={() => setRound(round + 1)}
			/>
			<BlindRankGame
				key={`${puzzle.id}:${round}`}
				puzzle={{ ...puzzle, viewerPlay: null }}
				practice
			/>
		</>
	)
}
