import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { ArcadeCallsLine } from "#/components/arcade/arcade-calls-line"
import { ArcadeNextSteps } from "#/components/arcade/arcade-next-steps"
import type {
	TeammateChainPlay_PlayFragment,
	TeammateChainPlayer_PlayerFragment,
	TeammateChainPuzzle_PuzzleFragment,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AddChainPlayerDocument,
	GiveUpTeammateChainDocument,
	HintTeammateChainDocument,
	invalidateTeammateChain,
	StartTeammateChainDocument,
	UndoChainPlayerDocument,
} from "#/graphql/teammate-chain/mutations"
import {
	type ChainInput,
	teammateChainGuestPlayQuery,
	teammateChainTodayQuery,
} from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import {
	type GuestChainGame,
	restoreGuestChainGame,
	saveGuestChainGame,
} from "#/stores/teammate-chain-store"
import { ChainBoard } from "./chain-board"
import { chainResultPath } from "./chain-result"
import { ChainReveal } from "./chain-reveal"
import { ChainStartPanel } from "./chain-start-panel"
import { ChainStats } from "./chain-stats"

type Puzzle = TeammateChainPuzzle_PuzzleFragment & {
	viewerPlay: TeammateChainPlay_PlayFragment | null
}

type PlayResult =
	| ({ __typename: "TeammateChainPlay" } & TeammateChainPlay_PlayFragment)
	| {
			__typename: "ValidationError"
			fieldErrors: { field: string | null; message: string }[]
	  }
	| { __typename: "NotFoundError"; message: string }
	| { __typename: string }

// Today's game. Signed in, every pick is judged and saved as it's made, and
// the clock starts on the server. Signed out, the picks and the times live in
// the browser and the API only judges them, until signing up saves the game
// to the new account (useImportTeammateChain). An admin's `practice` game,
// on any day, is judged the same way but kept only in this component.
export function TeammateChainGame({
	puzzle,
	practice = false,
}: {
	puzzle: Puzzle
	practice?: boolean
}) {
	const me = useMe()
	const guest = !me || practice
	const queryClient = useQueryClient()
	const start = useGqlMutation(StartTeammateChainDocument)
	const add = useGqlMutation(AddChainPlayerDocument)
	const undo = useGqlMutation(UndoChainPlayerDocument)
	const hint = useGqlMutation(HintTeammateChainDocument)
	const giveUp = useGqlMutation(GiveUpTeammateChainDocument)
	const [error, setError] = useState<string | null>(null)

	// Signed out: the game restored from the browser after mount.
	const [guestGame, setGuestGame] = useState<GuestChainGame | null>(null)
	useEffect(() => {
		if (!guest) return
		setGuestGame(
			practice
				? { puzzleId: puzzle.id, inputs: [], startedAt: null, finishedAt: null }
				: restoreGuestChainGame(puzzle.id),
		)
	}, [guest, practice, puzzle.id])
	const { data: guestData, isFetching: guestFetching } = useQuery({
		...teammateChainGuestPlayQuery(
			puzzle.id,
			guestGame?.inputs ?? [],
			guestGame?.startedAt ?? "",
			guestGame?.finishedAt ?? null,
		),
		enabled: guest && !!guestGame?.startedAt,
		placeholderData: keepPreviousData,
	})
	const guestPlay =
		guestData?.teammateChainGuestPlay.__typename === "TeammateChainPlay"
			? guestData.teammateChainGuestPlay
			: null

	function updateGuest(next: GuestChainGame) {
		setGuestGame(next)
		if (!practice) saveGuestChainGame(next)
	}

	// A guest's game ends when the API says so; the moment it came back is
	// when their clock stops.
	const guestOver = !!guestPlay && guestPlay.status !== "PLAYING"
	useEffect(() => {
		if (!guestGame || !guestOver || guestGame.finishedAt) return
		updateGuest({ ...guestGame, finishedAt: new Date().toISOString() })
	})

	const play: TeammateChainPlay_PlayFragment | null = guest
		? guestPlay
		: puzzle.viewerPlay
	const started = guest ? !!guestGame?.startedAt : !!puzzle.viewerPlay
	const over = !!play && play.status !== "PLAYING"
	const pending =
		start.isPending ||
		add.isPending ||
		undo.isPending ||
		hint.isPending ||
		giveUp.isPending ||
		guestFetching

	function apply(result: PlayResult) {
		if (result.__typename === "ValidationError" && "fieldErrors" in result) {
			setError(result.fieldErrors[0]?.message ?? "That didn't count.")
			return
		}
		if (result.__typename !== "TeammateChainPlay" || !("status" in result)) {
			setError("Today's chain has ended. Reload for the new one.")
			return
		}
		queryClient.setQueryData(teammateChainTodayQuery.queryKey, (old) =>
			old?.teammateChainToday
				? {
						teammateChainToday: {
							...old.teammateChainToday,
							viewerPlay: result,
						},
					}
				: old,
		)
		if (result.status !== "PLAYING") void invalidateTeammateChain(queryClient)
	}

	function guestInput(input: ChainInput) {
		if (!guestGame) return
		updateGuest({ ...guestGame, inputs: [...guestGame.inputs, input] })
	}

	async function onStart() {
		setError(null)
		if (!practice) {
			track("chain_puzzle_started", { date: puzzle.date, signedIn: !!me })
		}
		if (guest) {
			if (guestGame) {
				updateGuest({ ...guestGame, startedAt: new Date().toISOString() })
			}
			return
		}
		const data = await start.mutateAsync({ puzzleId: puzzle.id })
		apply(data.startTeammateChain)
	}

	async function onPick(player: TeammateChainPlayer_PlayerFragment) {
		setError(null)
		if (guest) {
			guestInput({ kind: "PICK", playerId: player.player.id })
			return
		}
		const data = await add.mutateAsync({
			puzzleId: puzzle.id,
			playerId: player.player.id,
		})
		apply(data.addChainPlayer)
	}

	async function onHint() {
		setError(null)
		if (guest) {
			guestInput({ kind: "HINT" })
			return
		}
		const data = await hint.mutateAsync({ puzzleId: puzzle.id })
		apply(data.hintTeammateChain)
	}

	async function onUndo() {
		setError(null)
		if (guest) {
			guestInput({ kind: "UNDO" })
			return
		}
		const data = await undo.mutateAsync({ puzzleId: puzzle.id })
		apply(data.undoChainPlayer)
	}

	async function onGiveUp() {
		setError(null)
		if (guest) {
			guestInput({ kind: "GIVE_UP" })
			return
		}
		const data = await giveUp.mutateAsync({ puzzleId: puzzle.id })
		apply(data.giveUpTeammateChain)
	}

	// Analytics as each pick comes back, signed in or out alike. The moves
	// seen on first load are the baseline, so a game restored from earlier in
	// the day isn't reported again.
	const seenMoves = useRef<number | null>(null)
	useEffect(() => {
		if (!play || practice) return
		if (seenMoves.current === null) {
			seenMoves.current = play.moves.length
			return
		}
		if (play.moves.length <= seenMoves.current) return
		seenMoves.current = play.moves.length
		const last = play.moves.at(-1)
		if (last?.kind === "ADD") {
			track("chain_player_added", {
				date: puzzle.date,
				position: play.chain.length,
			})
		}
		if (last?.kind === "MISS") {
			track("chain_missed", { date: puzzle.date, misses: play.misses })
		}
		if (last?.kind === "HINT") {
			track("chain_hint_used", {
				date: puzzle.date,
				hints: play.hints,
				clue: play.clues.length,
			})
		}
		if (play.status !== "PLAYING") {
			track("chain_puzzle_finished", {
				date: puzzle.date,
				result: play.links ?? "x",
				par: puzzle.par,
				misses: play.misses,
				seconds: play.seconds,
				signedIn: !!me,
			})
		}
	}, [play, puzzle.date, puzzle.par, me, practice])

	if (!started || !play) {
		return (
			<ChainStartPanel
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				par={puzzle.par}
				start={puzzle.start}
				target={puzzle.target}
				pending={pending || (started && !play)}
				onStart={() => void onStart()}
			/>
		)
	}

	if (over) {
		const resultUrl = play.resultCode
			? `${SITE_ORIGIN}${chainResultPath(puzzle.date, play.resultCode, guest ? null : me?.username)}`
			: `${SITE_ORIGIN}/arcade/teammate-chain`
		const reveal = (
			<ChainReveal
				date={puzzle.date}
				league={puzzle.league.abbreviation}
				par={puzzle.par}
				start={puzzle.start}
				target={puzzle.target}
				play={play}
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
				<ChainStats />
				<ArcadeNextSteps
					game="chain"
					resultUrl={resultUrl}
					onStep={(step) => track("chain_next_step_clicked", { step })}
					onShared={(method) =>
						track("chain_result_shared", {
							date: puzzle.date,
							method,
							toGroup: true,
						})
					}
				/>
				<ArcadeCallsLine
					onClick={() => track("chain_next_step_clicked", { step: "calls" })}
				/>
			</div>
		)
	}

	return (
		<ChainBoard
			puzzle={puzzle}
			play={play}
			pending={pending}
			error={error}
			onPick={(player) => void onPick(player)}
			onHint={() => void onHint()}
			onUndo={() => void onUndo()}
			onGiveUp={() => void onGiveUp()}
		/>
	)
}
