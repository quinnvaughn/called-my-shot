import { useSuspenseQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ArcadePracticeBar } from "#/components/arcade/arcade-practice-bar"
import { EmptyState } from "#/components/ui/empty-state"
import { adminSeasonPuzzleQuery } from "#/graphql/season-puzzles/queries"
import { NameThatSeasonGame } from "./name-that-season-game"

// An admin playing any scheduled day's puzzle start to finish, with nothing
// saved. Starting over remounts the game empty.
export function SeasonPractice({ date }: { date: string }) {
	const { data } = useSuspenseQuery(adminSeasonPuzzleQuery(date))
	const [round, setRound] = useState(0)
	const puzzle = data.adminSeasonPuzzle
	if (puzzle.__typename !== "SeasonPuzzle") {
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
				schedulePath="/admin/seasons"
				onRestart={() => setRound(round + 1)}
			/>
			<NameThatSeasonGame
				key={`${puzzle.id}:${round}`}
				puzzle={{ ...puzzle, viewerPlay: null }}
				practice
			/>
		</>
	)
}
