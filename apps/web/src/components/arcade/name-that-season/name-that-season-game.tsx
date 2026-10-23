import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { ArcadeCallsLine } from "#/components/arcade/arcade-calls-line"
import { ArcadeNextSteps } from "#/components/arcade/arcade-next-steps"
import type { SeasonPuzzlePlay_PlayFragment } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	GuessSeasonDocument,
	invalidateSeasonPuzzles,
} from "#/graphql/season-puzzles/mutations"
import {
	type SeasonGuess,
	seasonGuessOptionsQuery,
	seasonPuzzleGuestPlayQuery,
	seasonPuzzleTodayQuery,
} from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import {
	restoreGuestSeasonGame,
	setGuestSeasonGuesses,
} from "#/stores/season-puzzle-store"
import { GuessChip } from "./guess-chip"
import { GuessSquares } from "./guess-squares"
import { SeasonAllClues } from "./season-all-clues"
import { SeasonCard } from "./season-card"
import { SeasonGuessPicker } from "./season-guess-picker"
import {
	SEASON_MAX_GUESSES,
	seasonResultPath,
	seasonSquares,
} from "./season-result"
import { SeasonReveal } from "./season-reveal"
import { SeasonStats } from "./season-stats"

type Puzzle = {
	id: string
	date: string
	nextPuzzleAt: string
	league: { id: string; abbreviation: string }
	viewerPlay: SeasonPuzzlePlay_PlayFragment | null
}

// Today's game. Signed in, every guess is saved as it's made. Signed out,
// the guesses live in the browser and the API only evaluates them, until
// signing up saves the game to the new account (useImportSeasonGuesses).
// An admin's `practice` game, on any day, is evaluated the same way but kept
// only in this component.
export function NameThatSeasonGame({
	puzzle,
	practice = false,
}: {
	puzzle: Puzzle
	practice?: boolean
}) {
	const me = useMe()
	const guest = !me || practice
	const queryClient = useQueryClient()
	const guess = useGqlMutation(GuessSeasonDocument)
	const [error, setError] = useState<string | null>(null)

	// Signed out: guesses restored from the browser after mount.
	const [guestGuesses, setGuestGuesses] = useState<SeasonGuess[] | null>(null)
	useEffect(() => {
		if (!guest) return
		setGuestGuesses(practice ? [] : restoreGuestSeasonGame(puzzle.id))
	}, [guest, practice, puzzle.id])
	const { data: guestData, isFetching: guestFetching } = useQuery({
		...seasonPuzzleGuestPlayQuery(puzzle.id, guestGuesses ?? []),
		enabled: guest && guestGuesses !== null,
		placeholderData: keepPreviousData,
	})
	const guestPlay =
		guestData?.seasonPuzzleGuestPlay.__typename === "SeasonPuzzlePlay"
			? guestData.seasonPuzzleGuestPlay
			: null

	const play: SeasonPuzzlePlay_PlayFragment | null = guest
		? guestPlay
		: puzzle.viewerPlay

	const { data: optionsData } = useQuery(
		seasonGuessOptionsQuery(puzzle.league.id),
	)
	const franchises = optionsData?.seasonGuessOptions ?? []

	const guesses = play?.guesses ?? []
	const outcomes = guesses.map((g) => g.outcome)
	const status = play?.status ?? "PLAYING"

	async function makeGuess(next: SeasonGuess) {
		setError(null)
		const guessNumber = guesses.length + 1
		if (guessNumber === 1 && !practice) {
			track("season_puzzle_started", { date: puzzle.date, signedIn: !!me })
		}

		if (guest) {
			const all = [...(guestGuesses ?? []), next]
			if (!practice) setGuestSeasonGuesses(puzzle.id, all)
			setGuestGuesses(all)
			return
		}

		const data = await guess.mutateAsync({
			puzzleId: puzzle.id,
			teamId: next.teamId,
			year: next.year,
		})
		const result = data.guessSeason
		if (result.__typename === "ValidationError") {
			setError(result.fieldErrors[0]?.message ?? "That guess didn't count.")
			return
		}
		if (result.__typename !== "SeasonPuzzlePlay") {
			setError("Today's puzzle has ended. Reload for the new one.")
			return
		}
		queryClient.setQueryData(seasonPuzzleTodayQuery.queryKey, (old) =>
			old?.seasonPuzzleToday
				? {
						seasonPuzzleToday: { ...old.seasonPuzzleToday, viewerPlay: result },
					}
				: old,
		)
		if (result.status !== "PLAYING") void invalidateSeasonPuzzles(queryClient)
	}

	// Analytics as each guess comes back evaluated, signed in or out alike.
	// The count seen on first load is the baseline, so a game restored from
	// earlier in the day isn't reported again.
	const seenGuesses = useRef<number | null>(null)
	useEffect(() => {
		if (!play || practice) return
		const count = play.guesses.length
		if (seenGuesses.current === null) {
			seenGuesses.current = count
			return
		}
		if (count <= seenGuesses.current) return
		seenGuesses.current = count
		track("season_guess_made", {
			date: puzzle.date,
			guessNumber: count,
			outcome: play.guesses.at(-1)?.outcome ?? "MISS",
		})
		if (play.status !== "PLAYING") {
			track("season_puzzle_finished", {
				date: puzzle.date,
				result: play.guessCount ?? "x",
				signedIn: !!me,
			})
		}
	}, [play, puzzle.date, me, practice])

	if (status !== "PLAYING" && play?.answer) {
		const resultUrl = `${SITE_ORIGIN}${seasonResultPath(puzzle.date, outcomes, me?.username)}`
		const reveal = (
			<SeasonReveal
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				answer={play.answer}
				outcomes={outcomes}
				nextPuzzleAt={practice ? null : puzzle.nextPuzzleAt}
				resultUrl={resultUrl}
			/>
		)
		if (practice) {
			return (
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "6",
					})}
				>
					{reveal}
					<SeasonAllClues clues={play.clues} />
				</div>
			)
		}
		return (
			<div
				className={css({ display: "flex", flexDirection: "column", gap: "6" })}
			>
				{reveal}
				<SeasonStats todayGuessCount={play.guessCount ?? null} />
				<ArcadeNextSteps
					game="season"
					resultUrl={resultUrl}
					onStep={(step) => track("season_next_step_clicked", { step })}
					onShared={(method) =>
						track("season_result_shared", {
							date: puzzle.date,
							method,
							toGroup: true,
						})
					}
				/>
				<SeasonAllClues clues={play.clues} />
				<ArcadeCallsLine
					onClick={() => track("season_next_step_clicked", { step: "calls" })}
				/>
			</div>
		)
	}

	const clues = play?.clues ?? []
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "6" })}
		>
			<SeasonCard
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				clues={clues}
				freshIndex={guesses.length > 0 ? clues.length - 1 : null}
				footer={
					<GuessSquares squares={seasonSquares(outcomes, { active: true })} />
				}
			/>
			{guesses.length > 0 && (
				<div className={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
					{guesses.map((g) =>
						g.outcome === "HIT" ? null : (
							<GuessChip
								key={`${g.team.id}:${g.year}`}
								team={g.team}
								label={g.label}
								name={g.name}
								outcome={g.outcome}
								direction={g.direction ?? null}
							/>
						),
					)}
				</div>
			)}
			<SeasonGuessPicker
				franchises={franchises}
				guesses={guesses.map((g) => ({
					teamId: g.team.id,
					year: g.year,
					outcome: g.outcome,
					direction: g.direction ?? null,
				}))}
				guessesLeft={SEASON_MAX_GUESSES - guesses.length}
				pending={guess.isPending || guestFetching}
				error={error}
				onGuess={(next) => void makeGuess(next)}
			/>
		</div>
	)
}
