import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { ArcadeCallsLine } from "#/components/arcade/arcade-calls-line"
import { ArcadeNextSteps } from "#/components/arcade/arcade-next-steps"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import {
	invalidateRankPuzzles,
	PlaceRankDocument,
} from "#/graphql/blind-rank/mutations"
import {
	rankPuzzleGuestPlayQuery,
	rankPuzzleTodayQuery,
} from "#/graphql/blind-rank/queries"
import type { RankPlay_PlayFragment } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import {
	restoreGuestRankGame,
	setGuestRankPlacements,
} from "#/stores/rank-puzzle-store"
import { RankCard } from "./rank-card"
import { RANK_SLOTS, rankResultPath, rankSquares } from "./rank-result"
import { RankReveal } from "./rank-reveal"
import { RankSlotRow } from "./rank-slot-row"
import { RankStats } from "./rank-stats"

type Puzzle = {
	id: string
	date: string
	prompt: string
	context: string
	nextPuzzleAt: string
	league: { id: string; abbreviation: string }
	viewerPlay: RankPlay_PlayFragment | null
}

// Today's game. Signed in, every placement is saved as it's made. Signed
// out, the placements live in the browser and the API only evaluates them,
// until signing up saves the game to the new account
// (useImportRankPlacements). An admin's `practice` game, on any day, is
// evaluated the same way but kept only in this component.
export function BlindRankGame({
	puzzle,
	practice = false,
}: {
	puzzle: Puzzle
	practice?: boolean
}) {
	const me = useMe()
	const guest = !me || practice
	const queryClient = useQueryClient()
	const place = useGqlMutation(PlaceRankDocument)
	const [error, setError] = useState<string | null>(null)
	// The slot picked for the current item, 1 to 5, before it's placed.
	const [picked, setPicked] = useState<number | null>(null)

	// Signed out: placements restored from the browser after mount.
	const [guestPlacements, setGuestPlacementsState] = useState<number[] | null>(
		null,
	)
	useEffect(() => {
		if (!guest) return
		setGuestPlacementsState(practice ? [] : restoreGuestRankGame(puzzle.id))
	}, [guest, practice, puzzle.id])
	const { data: guestData, isFetching: guestFetching } = useQuery({
		...rankPuzzleGuestPlayQuery(puzzle.id, guestPlacements ?? []),
		enabled: guest && guestPlacements !== null,
		placeholderData: keepPreviousData,
	})
	const guestPlay =
		guestData?.rankPuzzleGuestPlay.__typename === "RankPlay"
			? guestData.rankPuzzleGuestPlay
			: null

	const play: RankPlay_PlayFragment | null = guest
		? guestPlay
		: puzzle.viewerPlay
	const slots = play?.slots ?? []
	const placedCount = slots.filter((s) => s.placed).length
	const done = play?.status === "DONE"

	const pending = place.isPending || guestFetching

	async function confirm(slot: number) {
		setError(null)
		if (placedCount === 0 && !practice) {
			track("rank_puzzle_started", { date: puzzle.date, signedIn: !!me })
		}
		setPicked(null)

		if (guest) {
			const next = [...(guestPlacements ?? []), slot - 1]
			if (!practice) setGuestRankPlacements(puzzle.id, next)
			setGuestPlacementsState(next)
			return
		}

		const data = await place.mutateAsync({ puzzleId: puzzle.id, slot })
		const result = data.placeRank
		if (result.__typename === "ValidationError") {
			setError(result.fieldErrors[0]?.message ?? "That didn't count.")
			return
		}
		if (result.__typename !== "RankPlay") {
			setError("Today's puzzle has ended. Reload for the new one.")
			return
		}
		queryClient.setQueryData(rankPuzzleTodayQuery.queryKey, (old) =>
			old?.rankPuzzleToday
				? { rankPuzzleToday: { ...old.rankPuzzleToday, viewerPlay: result } }
				: old,
		)
		if (result.status === "DONE") void invalidateRankPuzzles(queryClient)
	}

	// With a keyboard, a slot's number picks that slot and Enter places the
	// current item there, the same two steps as clicking.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
			const target = event.target as HTMLElement | null
			if (
				target?.isContentEditable ||
				target?.closest("input, textarea, select")
			) {
				return
			}
			if (done || pending || !play?.next) return
			if (event.key === "Enter") {
				if (picked === null) return
				// Other focused buttons and links keep their own Enter.
				if (
					target?.closest("button, a") &&
					!target.closest("[data-rank-slot]")
				) {
					return
				}
				event.preventDefault()
				void confirm(picked)
				return
			}
			const slot = Number(event.key)
			if (!Number.isInteger(slot) || slot < 1 || slot > RANK_SLOTS) return
			if (slots.find((s) => s.slot === slot)?.placed) return
			event.preventDefault()
			setPicked(slot)
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	})

	// Analytics as each placement comes back, signed in or out alike. The
	// count seen on first load is the baseline, so a game restored from
	// earlier in the day isn't reported again.
	const seenPlaced = useRef<number | null>(null)
	useEffect(() => {
		if (!play || practice) return
		if (seenPlaced.current === null) {
			seenPlaced.current = placedCount
			return
		}
		if (placedCount <= seenPlaced.current) return
		seenPlaced.current = placedCount
		track("rank_placed", { date: puzzle.date, placement: placedCount })
		if (play.status === "DONE") {
			track("rank_puzzle_finished", {
				date: puzzle.date,
				result: play.correctCount ?? 0,
				signedIn: !!me,
			})
		}
	}, [play, placedCount, puzzle.date, me, practice])

	if (done && play) {
		const squares = rankSquares(slots)
		const resultUrl = `${SITE_ORIGIN}${rankResultPath(puzzle.date, squares, me?.username)}`
		const reveal = (
			<RankReveal
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				prompt={puzzle.prompt}
				context={puzzle.context}
				slots={slots}
				correctCount={play.correctCount ?? 0}
				nextPuzzleAt={practice ? null : puzzle.nextPuzzleAt}
				resultUrl={resultUrl}
			/>
		)
		if (practice) return reveal
		return (
			<div
				className={css({ display: "flex", flexDirection: "column", gap: "6" })}
			>
				{reveal}
				<RankStats todayCorrect={play.correctCount ?? null} />
				<ArcadeNextSteps
					game="rank"
					resultUrl={resultUrl}
					onStep={(step) => track("rank_next_step_clicked", { step })}
					onShared={(method) =>
						track("rank_result_shared", {
							date: puzzle.date,
							method,
							toGroup: true,
						})
					}
				/>
				<ArcadeCallsLine
					onClick={() => track("rank_next_step_clicked", { step: "calls" })}
				/>
			</div>
		)
	}

	const left = RANK_SLOTS - placedCount
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<RankCard
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				prompt={puzzle.prompt}
				context={puzzle.context}
				current={play?.next ?? null}
			>
				{Array.from({ length: RANK_SLOTS }, (_, i) => {
					const slot = i + 1
					const placed = slots.find((s) => s.slot === slot)?.placed ?? null
					return (
						<RankSlotRow
							key={slot}
							slot={slot}
							placed={placed}
							selected={picked === slot}
							disabled={pending || !play?.next}
							onSelect={() => setPicked(slot)}
						/>
					)
				})}
			</RankCard>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
				})}
			>
				<p className={css({ textStyle: "label", color: "fg.muted" })}>
					{left === 1 ? "Last one to place" : `${left} to place`} · no moving
					them once placed
					<span className={css({ display: { base: "none", lg: "inline" } })}>
						{" "}
						· press a slot's number to pick it, Enter to place
					</span>
				</p>
				<Button
					variant="solid"
					disabled={picked === null}
					loading={pending}
					onClick={() => {
						if (picked !== null) void confirm(picked)
					}}
				>
					{picked === null ? "Pick a slot" : `Place at ${picked}`}
				</Button>
			</div>
			<FormError message={error} />
		</div>
	)
}
